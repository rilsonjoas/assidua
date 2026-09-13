<?php

namespace App\Actions;

use App\Models\DoseSchedule;
use Carbon\Carbon;

// "Frequência de horário" (Fase 2, 2026-08-14) — decisão de produto
// confirmada com o Rilson: vale o esforço de um modelo de intervalo de
// verdade em vez de só sugerir cadastrar 3 horários fixos pra simular
// "de 8 em 8 horas".
//
// `interval_hours` já existia na coluna/validação desde antes (achado
// ao investigar — alguém começou e nunca terminou de ligar em lugar
// nenhum que gera dose de verdade). Esta Action é o único lugar que
// decide "quantas doses este horário gera num dia, e a que horas" —
// usada em todo lugar que antes assumia 1 dose por horário por dia
// (DoseLogController::today, CheckMissedDoses, cálculo de streak e de
// adesão semanal). Centralizar aqui evita a mesma lógica divergir em 5
// lugares com o tempo, do mesmo jeito que MarkDoseMissedAndNotifyCollaborators
// já faz pro "o que acontece quando uma dose vira perdida".
//
// Semântica: `interval_hours` setado ignora `days_of_week` de propósito
// — remédio "de X em X horas" é tipicamente de curso contínuo (dor,
// antibiótico), não "só às terças". `time` continua sendo obrigatório
// nos dois casos: horário fixo usa como o próprio horário; intervalo
// usa como âncora, repetindo de `interval_hours` em `interval_hours`
// como um relógio contínuo de 24h — inclui a ocorrência que "atravessa"
// a meia-noite quando a âncora não divide 24h de forma exata (ex.:
// 10:00 de 8 em 8h gera 02:00, 10:00, 18:00, não só 10:00/18:00; achado
// real do Rilson 2026-09-09, ver `intervalOccurrences`). Cada dia
// calcula essa ocorrência "de madrugada" a partir do PRÓPRIO `time` do
// schedule, não do dia anterior de verdade — não existe estado
// compartilhado entre dias, só a mesma conta de relógio de 24h repetida
// pra cada `$date` pedido.
class GenerateScheduleOccurrences
{
    /**
     * @return Carbon[]
     */
    public function handle(DoseSchedule $schedule, Carbon $date): array
    {
        $occurrences = $schedule->interval_hours !== null
            ? $this->intervalOccurrences($schedule, $date)
            : $this->fixedOccurrences($schedule, $date);

        return $this->excludeOccurrencesAfterPause($schedule, $occurrences);
    }

    /**
     * @return Carbon[]
     */
    private function fixedOccurrences(DoseSchedule $schedule, Carbon $date): array
    {
        $dayOfWeek = (int) $date->dayOfWeek;
        if ($schedule->days_of_week !== null && ! in_array($dayOfWeek, $schedule->days_of_week, true)) {
            return [];
        }

        return [$date->copy()->setTimeFromTimeString($schedule->time)];
    }

    // "Pausar não deveria esconder o que já aconteceu" (entrevista de
    // horário, 2026-09-12) — achado real do Rilson: pausar um remédio
    // hoje escondia a dose já tomada hoje inteira (a tela Hoje excluía o
    // medicamento pausado de ponta a ponta). Mas simplesmente PARAR de
    // filtrar por `is_paused` também está errado: uma ocorrência de hoje
    // que ainda nem tinha vencido no momento da pausa nunca deveria ter
    // sido gerada (é exatamente isso que pausar significa pro futuro).
    // A divisa certa é o INSTANTE da pausa, não o dia inteiro: ocorrência
    // até `paused_at` (inclusive) é história real, continua contando;
    // depois de `paused_at`, nunca existiu. Centralizado aqui (não em
    // cada chamador) pelo mesmo motivo do resto desta classe — evitar a
    // mesma conta divergindo em 5 lugares.
    /**
     * @param  Carbon[]  $occurrences
     * @return Carbon[]
     */
    private function excludeOccurrencesAfterPause(DoseSchedule $schedule, array $occurrences): array
    {
        $medication = $schedule->medication;
        if (! $medication || ! $medication->is_paused) {
            return $occurrences;
        }

        // `paused_at` desconhecido (registro de teste/seed/legado que
        // marcou `is_paused=true` direto, sem passar pelo
        // MedicationController::update, que é quem carimba o instante) —
        // sem o instante exato não dá pra separar "antes"/"depois" da
        // pausa, então assume o mais seguro: sempre esteve pausado. Igual
        // ao comportamento de antes desta mudança (esconde tudo), nunca
        // pior — evita um médio-termo estranho de "mostra tudo porque não
        // sei quando pausou".
        if (! $medication->paused_at) {
            return [];
        }

        return array_values(array_filter(
            $occurrences,
            fn (Carbon $occurrence) => $occurrence->lte($medication->paused_at),
        ));
    }

    // "Dose fora do horário + recálculo" (item 8, 2026-09-08) — achado
    // real do Rilson: tomar um remédio de intervalo bem fora do previsto
    // (ex.: das 8h, só às 10h) deveria poder deslocar as doses
    // RESTANTES daquele dia, sem virar o novo horário permanente (isso
    // já existe em editar horário). `today_override_date`/`_time`
    // guardam esse ajuste; só valem quando a data bate com o `$date`
    // pedido aqui — dia seguinte, o override simplesmente não bate mais
    // e a âncora volta sozinha a ser `time`, sem job de limpeza.
    private function intervalOccurrences(DoseSchedule $schedule, Carbon $date): array
    {
        $usingOverride = (bool) $schedule->today_override_date?->isSameDay($date);
        $anchorTime = $usingOverride ? $schedule->today_override_time : $schedule->time;
        $intervalHours = $schedule->interval_hours;

        $cursor = $date->copy()->setTimeFromTimeString($anchorTime);
        $startOfDay = $date->copy()->startOfDay();
        $endOfDay = $date->copy()->endOfDay();

        // Achado real do Rilson (2026-09-09): quando a âncora não divide
        // 24h de forma exata (ex.: 10:00 de 8 em 8h — 10h, 18h, 02h do
        // dia seguinte), o cálculo antigo sempre recomeçava na âncora a
        // cada dia e nunca olhava pra trás. Resultado: a ocorrência que
        // "atravessa" a meia-noite (aqui, 02h) nunca era gerada em NENHUM
        // dia — nem hoje (corta às 23:59 antes de chegar lá), nem amanhã
        // (recomeça do zero na âncora, sem herdar o que sobrou de ontem).
        // Uma dose de verdade sumia da agenda pra sempre, todo santo dia.
        // Corrigido andando pra trás a partir da âncora, uma volta de
        // intervalo por vez, enquanto a ocorrência anterior ainda cair
        // dentro do MESMO dia — só então anda pra frente normalmente.
        // Não se aplica ao override (recálculo "só hoje"): esse já
        // significa "a partir de agora pra frente", nunca pra trás (ver
        // comentário abaixo, achado de revisão de código anterior).
        if (! $usingOverride) {
            while ($cursor->copy()->subHours($intervalHours)->gte($startOfDay)) {
                $cursor->subHours($intervalHours);
            }
        }

        // Achado real (revisão de código, 2026-09-08): quando a âncora
        // vem de um recálculo, ela É o horário que a pessoa acabou de
        // registrar como tomado — foi exatamente esse `taken_at` que
        // disparou a oferta de ajustar. Gerar uma ocorrência EM CIMA
        // dessa âncora aqui orfanaria o DoseLog recém-criado (o
        // `scheduled_at` antigo dele deixa de bater com qualquer
        // ocorrência do dia) e criaria uma dose "perdida" fantasma no
        // lugar de uma dose que a pessoa literalmente acabou de tomar.
        // Recalcular sempre significa "a partir de agora pra frente",
        // nunca "esse instante também é uma dose nova" — por isso pula
        // a própria âncora e só começa a listar a partir do intervalo
        // seguinte, só no caso de vir de um override.
        if ($usingOverride) {
            $cursor->addHours($intervalHours);
        }

        $occurrences = [];
        while ($cursor->lte($endOfDay)) {
            $occurrences[] = $cursor->copy();
            $cursor = $cursor->copy()->addHours($intervalHours);
        }

        return $occurrences;
    }
}
