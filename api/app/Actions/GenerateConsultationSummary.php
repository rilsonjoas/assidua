<?php

namespace App\Actions;

use App\Models\DoseLog;
use App\Models\DoseSchedule;
use App\Models\Profile;
use Carbon\Carbon;

// "Resumo pra consulta" (2026-08-23, ideia de produto aprovada pelo
// Rilson). Evolução do "exportar histórico" original: não é dump de
// dado bruto, é o documento que faz um médico levar o app a sério —
// % de adesão do período E quais doses foram perdidas, com data/hora,
// pra ponte real com o atendimento clínico, não só estatística de uso.
// Mesma lógica de "dia devido" de CalculateWeeklyAdherence, generalizada
// pra um período arbitrário (30/60/90 dias) em vez de sempre 7.
class GenerateConsultationSummary
{
    // Estados possíveis de uma ocorrência. **Fatuais, não julgamentos**:
    // o relatório mostra os DOIS horários e deixa o leitor concluir
    // (decisão X3 do Rilson, ROADMAP §10.5) — nada aqui diz "atrasado".
    //
    //   recorded      — a pessoa registrou. scheduled_at e taken_at vão
    //                   juntos e a diferença é visível.
    //   skipped       — pulou de propósito. É decisão informada, não
    //                   falha, e por isso não entra em `missed`.
    //   unrecorded    — não há registro nenhum, e a tolerância de 24h
    //                   ainda não passou (DoseLog::MISSED_TOLERANCE_HOURS).
    //   marked_missed — o app marcou como perdida depois da tolerância.
    //
    // `unrecorded` e `marked_missed` são **fatos diferentes** e o relatório
    // precisa dizer qual é qual: o primeiro é ausência, o segundo é
    // veredito. Antes de 2026-09-25 os dois colapsavam na mesma linha
    // (ROADMAP §8.3).
    public const STATE_RECORDED = 'recorded';
    public const STATE_SKIPPED = 'skipped';
    public const STATE_UNRECORDED = 'unrecorded';
    public const STATE_MARKED_MISSED = 'marked_missed';

    public function __construct(private GenerateScheduleOccurrences $generateOccurrences) {}

    // `$medicationId` (2026-09-08, item 16) — achado real do Rilson: o
    // PDF de consulta sempre saía fixo (todos os remédios, 30 dias),
    // ignorando o filtro por medicamento que a pessoa via e mexia na
    // tela de Histórico. Opcional: sem ele, comportamento idêntico a
    // antes (todos os remédios do perfil).
    public function handle(Profile $profile, int $days, ?int $medicationId = null): array
    {
        $today = Carbon::today($profile->timezone);
        $periodStart = $today->copy()->subDays($days - 1);

        // Achado real do Rilson (2026-09-12), mesma auditoria do "pausar
        // não deveria esconder o que já aconteceu": esta query nunca
        // filtrou `is_paused` (nem devia — o resumo de consulta é sobre
        // o passado real). Mas sem `is_paused`/`paused_at` no select do
        // `with('medication')`, GenerateScheduleOccurrences não tinha
        // como saber a partir de quando parar de contar "devido" pra um
        // remédio pausado — geraria "perdida" fantasma pra sempre depois
        // da pausa. Corrigido só ampliando as colunas carregadas; a
        // lógica de corte já existe, centralizada lá.
        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', function ($q) use ($profile, $medicationId) {
                $q->where('profile_id', $profile->id);
                if ($medicationId !== null) {
                    $q->where('id', $medicationId);
                }
            })
            ->with('medication:id,name,is_paused,paused_at')
            ->get();

        // P1 (2026-09-25, ROADMAP §9.1) — os logs do período são
        // carregados **uma vez**, indexados por `scheduled_at`, em vez de
        // uma query por ocorrência dentro do laço.
        //
        // Antes, por ocorrência, a busca era:
        //     ->where(scheduled_at = X)
        //       ->orWhere(scheduled_at = X em UTC)
        //       ->orWhereDate(scheduled_at, dia de X)   ← a causa do bug
        //     ->first()                                ← sem orderBy
        //
        // O `orWhereDate` casava QUALQUER log daquele schedule naquele
        // dia, e o `first()` sem `orderBy` pegava o primeiro. Para
        // `interval_hours` (a cada 8 h = 3 ocorrências/dia) perguntar pela
        // ocorrência das 15:00 podia pegar o log das 07:00 e contar como
        // tomada — e as de 15:00 e 23:00 nunca entravam em `missed`. O
        // relatório inflava adesão e escondia perdas reais. Teste:
        // `test_relatorio_conta_cada_ocorrencia_de_intervalo_separadamente`.
        //
        // A convenção é a MESMA que as outras duas leituras do projeto
        // (`DoseLogController::today()` e `CheckMissedDoses`): casa
        // `scheduled_at` exato em 'Y-m-d H:i:s', hora local do perfil, sem
        // fuso. As variantes UTC e por data foram removidas de propósito —
        // a tolerância delas É o bug. Se um registro não casa na
        // ocorrência, ele é de outra ocorrência, e dizer que não há
        // registro é honesto; casar com a ocorrência errada não é.
        $logsByOccurrence = $this->indexLogs($profile, $periodStart, $today);

        // P4 (§10.4) — as doses de resgate do período, carregadas à
        // parte. `indexLogs` não as alcança: ele indexa por
        // (schedule, scheduled_at), e a PRN não tem nenhum dos dois.
        // São buscadas por `taken_at` — o único instante que elas têm.
        $rescueLogs = DoseLog::where('profile_id', $profile->id)
            ->whereNull('dose_schedule_id')
            ->whereNotNull('client_key')
            ->whereNotNull('taken_at')
            ->whereBetween('taken_at', [
                $periodStart->format('Y-m-d H:i:s'),
                $today->copy()->endOfDay()->format('Y-m-d H:i:s'),
            ])
            ->with('medication:id,name')
            ->orderBy('taken_at')
            ->get();

        $totalDue = 0;
        $totalTaken = 0;
        $rescueCount = 0; // P4/D13 — quantas dessas vêm de dose de resgate
        $missed = [];
        $doses = [];

        $cursor = $periodStart->copy();
        while ($cursor->lte($today)) {
            foreach ($schedules as $schedule) {
                foreach ($this->generateOccurrences->handle($schedule, $cursor) as $scheduledAt) {
                    if ($scheduledAt->gt(now())) {
                        continue; // ainda não chegou a hora, não conta como devido
                    }

                    $totalDue++;

                    $log = $logsByOccurrence[$schedule->id][$scheduledAt->format('Y-m-d H:i:s')] ?? null;
                    $state = $this->stateOf($log);

                    if ($state === self::STATE_RECORDED) {
                        $totalTaken++;
                    } elseif ($state !== self::STATE_SKIPPED) {
                        // `unrecorded` e `marked_missed` entram na lista,
                        // cada um com o SEU motivo. `skipped` fica de
                        // fora — decisão informada não é falha.
                        $missed[] = [
                            'medication_name' => $schedule->medication->name,
                            'scheduled_at' => $scheduledAt->toIso8601String(),
                            'taken_at' => null,
                            'state' => $state,
                            'reason' => $this->reasonOf($state),
                            'note' => $log?->notes,
                        ];
                    }

                    // P1/§9.2: o relatório carrega as OCORRÊNCIAS todas,
                    // não só as perdidas — com os dois horários. É o que
                    // permite ao médico ver "08:00 → tomado às 11:20"
                    // em vez de "tomado" a seco, e satisfaz o pedido do
                    // Rilson de que histórico, PDF e relatório separem
                    // os casos em linguagem clara (§8.1).
                    $doses[] = [
                        'medication_name' => $schedule->medication->name,
                        'medication_id' => $schedule->medication_id,
                        'scheduled_at' => $scheduledAt->toIso8601String(),
                        'taken_at' => $log?->takenAtInTimezone($profile->timezone)?->toIso8601String(),
                        'state' => $state,
                        'note' => $log?->notes,
                    ];
                }
            }
            $cursor->addDay();
        }

        // P4/D13 — o terceiro caso do relatório: a dose de resgate.
        //
        // Ela não cabe em nenhum dos dois formatos que o relatório já
        // tinha. Não é "perdida" (ninguém falhou) e não é uma ocorrência
        // (não havia horário previsto), então amanhã o loop das
        // occurrences simplesmente não a geraria e ela sumiria do PDF
        // do médico — o registro de um remédio que a pessoa TOMOU.
        //
        // Aqui ela entra: `scheduled_at = null` e `taken_at` preenchido
        // são a assinatura que o template usa para rotular "fora de
        // horário previsto" em vez de "não tomada". Somar em
        // `totalTaken` é o D13; `totalDue` fica intacto acima, porque a
        // PRN não tem horário que a tornasse devida.
        foreach ($rescueLogs as $rescueLog) {
            $takenAt = $rescueLog->takenAtInTimezone($profile->timezone);

            if (! $takenAt || $takenAt->gt(now())) {
                continue; // ainda não aconteceu — igual ao `continue` das ocorrências
            }

            $totalTaken++;
            $rescueCount++;

            $doses[] = [
                'medication_name' => $rescueLog->medication->name,
                'medication_id' => $rescueLog->medication_id,
                // A assinatura do terceiro caso: um lado é nulo, o outro
                // não. O template (reportHtml.ts) decide o rótulo por
                // isto, e não por um campo novo — porque "não tem
                // horário previsto" é a informação, não um rótulo.
                'scheduled_at' => null,
                'taken_at' => $takenAt->toIso8601String(),
                'state' => self::STATE_RECORDED,
                'note' => $rescueLog->notes,
                // Campos que só a PRN tem, para o template poder
                // dizer "de resgate" sem adivinhar pelo remédio.
                'is_rescue' => true,
                'client_key' => $rescueLog->client_key,
            ];
        }

        return [
            'period_days' => $days,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $today->toDateString(),
            // O teto de 100% é a mesma razão do DailyAdherence: com a
            // PRN no numerador e fora do denominador, a razão crua passa
            // de 100 num dia em que a pessoa fez tudo E ainda tomou
            // resgate. "130% de adesão" é falso — adesão mede o quanto
            // do previsto foi cumprido, e 100% é o teto. As contas
            // abaixo ficam íntegras e o relatório mostra as doses de
            // resgate na lista, então o médico vê de onde vieram.
            'percentage' => $totalDue > 0 ? min(100, (int) round(($totalTaken / $totalDue) * 100)) : null,
            'taken' => $totalTaken,
            'due' => $totalDue,
            'rescue' => $rescueCount,
            'missed' => $missed,
            'doses' => $doses,
            // §9.5 — antes, `reportHtml.ts:44` imprimia "Todas as doses
            // agendadas foram tomadas no período" sempre que `missed`
            // vinha vazio, **inclusive com `due === 0`** (remédio pausado
            // o mês inteiro, filtro errado). Ou seja: afirmava que tudo
            // foi tomado quando nada estava previsto. `all_taken` é
            // `null` quando não há o que afirmar, e o template diz "sem
            // doses previstas" em vez de "tudo tomado".
            'all_taken' => $totalDue > 0 && $missed === [] ? true : null,
        ];
    }

    /**
     * Carrega uma vez todos os logs do período, indexados por
     * `schedule_id` e por `scheduled_at` exato.
     *
     * @return array<int, array<string, DoseLog>>
     */
    private function indexLogs(Profile $profile, Carbon $from, Carbon $to): array
    {
        $indexed = [];

        DoseLog::where('profile_id', $profile->id)
            ->whereBetween('scheduled_at', [$from->format('Y-m-d H:i:s'), $to->copy()->endOfDay()->format('Y-m-d H:i:s')])
            ->get()
            ->each(function (DoseLog $log) use (&$indexed) {
                $indexed[$log->dose_schedule_id][$log->scheduled_at] = $log;
            });

        return $indexed;
    }

    private function stateOf(?DoseLog $log): string
    {
        return match ($log?->status) {
            'taken' => self::STATE_RECORDED,
            'skipped' => self::STATE_SKIPPED,
            'missed' => self::STATE_MARKED_MISSED,
            default => self::STATE_UNRECORDED,
        };
    }

    // Rótulos em linguagem clara, para o relatório e o PDF. O texto é
    // **descritivo, não acusatório**: "sem registro" é ausência, e
    // "marcada como perdida" é o app tendo registrado um veredito. São as
    // palavras que separam as duas coisas na frente do médico (§8.3).
    private function reasonOf(string $state): string
    {
        return match ($state) {
            self::STATE_MARKED_MISSED => 'marcada como perdida',
            default => 'sem registro',
        };
    }
}
