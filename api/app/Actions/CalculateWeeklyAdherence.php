<?php

namespace App\Actions;

use App\Models\DoseSchedule;
use App\Models\Profile;
use Carbon\Carbon;

// "Resumo semanal" (Fase 2, 2026-08-13) — % de adesão dos últimos 7 dias
// (hoje incluído, indo 6 dias pra trás). Mesma lógica de "dia devido"
// usada em CalculateAdherenceStreak (schedules ativos+não pausados,
// projetados pra trás por dia da semana), só que soma tomadas/previstas
// em vez de contar sequência.
class CalculateWeeklyAdherence
{
    public function __construct(private GenerateScheduleOccurrences $generateOccurrences) {}

    public function handle(Profile $profile, ?Carbon $endDate = null): array
    {
        $today = $endDate ?? Carbon::today($profile->timezone);
        $weekStart = $today->copy()->subDays(6);

        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true)->where('is_paused', false))
            ->get(['id', 'time', 'days_of_week', 'interval_hours']);

        if ($schedules->isEmpty()) {
            return ['taken' => 0, 'due' => 0, 'percentage' => null];
        }

        $logsByDate = $profile->doseLogs()
            ->whereIn('dose_schedule_id', $schedules->pluck('id'))
            ->where('scheduled_at', '>=', $weekStart)
            ->where('scheduled_at', '<', $today->copy()->addDay())
            ->get(['dose_schedule_id', 'status', 'scheduled_at'])
            ->groupBy(fn ($log) => $log->scheduled_at->format('Y-m-d'));

        $totalDue = 0;
        $totalTaken = 0;

        for ($date = $weekStart->copy(); $date->lte($today); $date->addDay()) {
            // "Frequência de horário" (2026-08-14): "devido" agora conta
            // ocorrências, não schedules — mesmo ajuste de CalculateAdherenceStreak.
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
                continue;
            }

            $dayLogs = $logsByDate->get($date->format('Y-m-d'), collect())
                ->filter(fn ($log) => in_array($log->dose_schedule_id, $dueScheduleIds));

            $totalDue += $dueCount;
            $totalTaken += $dayLogs->where('status', 'taken')->count();
        }

        return [
            'taken' => $totalTaken,
            'due' => $totalDue,
            'percentage' => $totalDue > 0 ? (int) round($totalTaken / $totalDue * 100) : null,
        ];
    }
}
