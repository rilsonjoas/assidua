<?php

namespace App\Actions;

use App\Models\DoseSchedule;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Support\Collection;

// "Calendário de adesão" (v1.3, aprovado 2026-09-02) — extraído do laço
// interno de CalculateWeeklyAdherence pra virar peça reutilizável: o
// calendário mensal precisa do MESMO cálculo dia a dia, não só do total
// da semana. Weekly agora compõe isto em vez de duplicar a lógica (ver
// comentário de GenerateScheduleOccurrences sobre não deixar a mesma
// conta divergir em lugares diferentes).
//
// `$schedules` é opcional: quem já busca os schedules ativos uma vez só
// pra iterar vários dias (semana inteira, mês inteiro) passa a mesma
// coleção aqui, evitando refazer a mesma query N vezes.
class CalculateDailyAdherence
{
    public function __construct(private GenerateScheduleOccurrences $generateOccurrences) {}

    public function handle(Profile $profile, Carbon $date, ?Collection $schedules = null): array
    {
        // Mesmo achado de CalculateAdherenceStreak (2026-09-12): sem
        // filtro de pausado aqui, GenerateScheduleOccurrences decide pelo
        // instante de `paused_at`.
        $schedules ??= DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true))
            ->with('medication:id,is_paused,paused_at')
            ->get(['id', 'medication_id', 'time', 'days_of_week', 'interval_hours']);

        // P4/D13: quem SÓ usa remédio de resgate não tem schedule
        // nenhum, e o early-return antigo dizia "nada aconteceu" num
        // dia em que a pessoa tomou o remédio. Só é preciso sair
        // quando não há dose de resgate no dia também.
        $rescueCount = $this->rescueCountFor($profile, $date);

        if ($schedules->isEmpty() && $rescueCount === 0) {
            return ['taken' => 0, 'due' => 0, 'percentage' => null, 'rescue' => 0];
        }

        // "Frequência de horário" (2026-08-14): "devido" conta ocorrências,
        // não schedules — um "de 8 em 8h" vale 3 doses devidas no dia,
        // não 1 (mesmo ajuste já usado em CalculateWeeklyAdherence/streak).
        //
        // **P2 (2026-09-25) — ocorrência que AINDA NÃO CHEGOU não conta.**
        // Esta é a mesma lei de `GenerateConsultationSummary:107`
        // (`if ($scheduledAt->gt(now())) continue;`, "ainda não chegou a
        // hora, não conta como devido") e a mesma que o anel da Home já
        // usa desde o 9.5a.
        //
        // Sem isto, o calendário e o anel discordavam: às 08:00, com 3
        // doses no dia e nenhuma tomada, o anel dizia "0 de 1" (o
        // conserto do 9.5a) e o calendário dizia **0% em vermelho** com
        // 3 no denominador. Dois valores de adesão na mesma tela, e o
        // calendário era o errado.
        //
        // E o efeito colateral é o desejado: o dia em andamento deixa de
        // "preencher" com números que ainda não é real.
        $dueScheduleIds = [];
        $dueCount = 0;
        foreach ($schedules as $schedule) {
            $occurrences = array_filter(
                $this->generateOccurrences->handle($schedule, $date),
                fn (Carbon $scheduledAt) => ! $scheduledAt->gt(now()),
            );

            if ($occurrences !== []) {
                $dueScheduleIds[] = $schedule->id;
                $dueCount += count($occurrences);
            }
        }

        $takenCount = $profile->doseLogs()
            ->whereIn('dose_schedule_id', $dueScheduleIds)
            ->where('scheduled_at', '>=', $date->copy()->startOfDay())
            ->where('scheduled_at', '<', $date->copy()->addDay()->startOfDay())
            ->where('status', 'taken')
            ->count();

        // P4 / D13 — a dose de resgate entra no NUMERADOR e nunca no
        // DENOMINADOR.
        //
        // O denominador acima saiu de ocorrências de horário, e a PRN não
        // tem horário: ela não pode virar "devida". Já contar quem tomou o
        // remédio certo é o outro lado da verdade — esconder isso é
        // dizer que a adesão foi pior do que foi.
        //
        // Contada por `taken_at` (e não por `scheduled_at`, que é nulo),
        // e pelo dia em que foi TOMADA — que é como o app agrupa a
        // dose no Histórico (`dayOfDose` em `services/doses.ts`). Se os
        // dois lados usassem dias diferentes, o anel e o histórico
        // discordariam sobre a mesma dose.
        // `due === 0` com resgate tomado é um caso REAL (quem só usa
        // remédio de resgate não tem horário previsto nenhum), e o
        // early-return antigo o apagava: o app dizia "nada aconteceu"
        // num dia em que a pessoa tomou o remédio. Por isso o
        // percentual só é `null` — divisão por zero não tem resposta —
        // mas a contagem continua sendo verdadeira.
        if ($dueCount === 0) {
            return ['taken' => $rescueCount, 'due' => 0, 'percentage' => null, 'rescue' => $rescueCount];
        }

        $total = $takenCount + $rescueCount;

        return [
            'taken' => $total,
            'due' => $dueCount,
            // O teto de 100 é uma consequência direta do D13, e é
            // deliberado. Com a dose de resgate no numerador e fora do
            // denominador, 10 doses previstas + 3 de resgate dariam
            // "130% de adesão" — e esse número é falso: adesão é o
            // quanto do que foi PLANEJADO foi cumprido, e 100% é o
            // máximo possível disso. Passar de 100% diria ao médico que
            // o app está errado (e está, no número), além de
            // contradizer o Histórico, que calcula a adesão só sobre
            // ocorrências e portanto nunca passa de 100. Dois valores
            // de adesão na mesma tela é exatamente o que o P2 veio
            // eliminar.
            //
            // As CONTAS não são cortadas — `taken` continua 13 e `due`
            // continua 10 —, e `rescue` expõe de onde vieram os 3 a
            // mais. O corte é só na leitura percentual, que é a única
            // coisa que não pode passar de 100.
            'percentage' => min(100, (int) round($total / $dueCount * 100)),
            'rescue' => $rescueCount,
        ];
    }

    /**
     * Doses de resgate (PRN) TOMADAS em `$date` — o numerador do D13.
     *
     * Contadas por `taken_at` e pelo dia em que foram tomadas, que é
     * como o app agrupa a dose no Histórico (`dayOfDose`, em
     * `services/doses.ts`). Se um lado usasse o dia previsto e o outro
     * o dia real, o mesmo registro contaria em dias diferentes.
     *
     * `whereNull('dose_schedule_id')` + `whereNotNull('client_key')` é
     * o que separa a PRN da agendada sem depender do status: é a forma
     * da linha, não o resultado dela.
     */
    private function rescueCountFor(Profile $profile, Carbon $date): int
    {
        return $profile->doseLogs()
            ->whereNull('dose_schedule_id')
            ->whereNotNull('client_key')
            ->where('taken_at', '>=', $date->copy()->startOfDay())
            ->where('taken_at', '<', $date->copy()->addDay()->startOfDay())
            ->where('status', 'taken')
            ->count();
    }
}
