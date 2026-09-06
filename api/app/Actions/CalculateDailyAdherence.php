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
        $schedules ??= DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true)->where('is_paused', false))
            ->get(['id', 'time', 'days_of_week', 'interval_hours']);

        if ($schedules->isEmpty()) {
            return ['taken' => 0, 'due' => 0, 'percentage' => null];
        }

        // "Frequência de horário" (2026-08-14): "devido" conta ocorrências,
        // não schedules — um "de 8 em 8h" vale 3 doses devidas no dia,
        // não 1 (mesmo ajuste já usado em CalculateWeeklyAdherence/streak).
        $dueScheduleIds = [];
        $dueCount = 0;
        foreach ($schedules as $schedule) {
            $occurrenceCount = count($this->generateOccurrences->handle($schedule, $date));
            if ($occurrenceCount > 0) {
                $dueScheduleIds[] = $schedule->id;
                $dueCount += $occurrenceCount;
            }
        }

        if ($dueCount === 0) {
            return ['taken' => 0, 'due' => 0, 'percentage' => null];
        }

        $takenCount = $profile->doseLogs()
            ->whereIn('dose_schedule_id', $dueScheduleIds)
            ->where('scheduled_at', '>=', $date->copy()->startOfDay())
            ->where('scheduled_at', '<', $date->copy()->addDay()->startOfDay())
            ->where('status', 'taken')
            ->count();

        return [
            'taken' => $takenCount,
            'due' => $dueCount,
            'percentage' => (int) round($takenCount / $dueCount * 100),
        ];
    }
}
