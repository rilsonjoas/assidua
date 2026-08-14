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

    private function intervalOccurrences(DoseSchedule $schedule, Carbon $date): array
    {
        $occurrences = [];
        $cursor = $date->copy()->setTimeFromTimeString($schedule->time);
        $endOfDay = $date->copy()->endOfDay();

        while ($cursor->lte($endOfDay)) {
            $occurrences[] = $cursor->copy();
            $cursor = $cursor->copy()->addHours($schedule->interval_hours);
        }

        return $occurrences;
    }
}
