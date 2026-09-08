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
// usa como âncora do primeiro horário do dia, repetindo a partir dali
// até (e não além) da meia-noite do mesmo dia — a próxima ocorrência
// depois da meia-noite pertence ao cálculo do dia seguinte, não
// "vaza" pro dia anterior.
class GenerateScheduleOccurrences
{
    /**
     * @return Carbon[]
     */
    public function handle(DoseSchedule $schedule, Carbon $date): array
    {
        if ($schedule->interval_hours !== null) {
            return $this->intervalOccurrences($schedule, $date);
        }

        $dayOfWeek = (int) $date->dayOfWeek;
        if ($schedule->days_of_week !== null && ! in_array($dayOfWeek, $schedule->days_of_week, true)) {
            return [];
        }

        return [$date->copy()->setTimeFromTimeString($schedule->time)];
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

        $occurrences = [];
        $cursor = $date->copy()->setTimeFromTimeString($anchorTime);

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
            $cursor->addHours($schedule->interval_hours);
        }

        $endOfDay = $date->copy()->endOfDay();

        while ($cursor->lte($endOfDay)) {
            $occurrences[] = $cursor->copy();
            $cursor = $cursor->copy()->addHours($schedule->interval_hours);
        }

        return $occurrences;
    }
}
