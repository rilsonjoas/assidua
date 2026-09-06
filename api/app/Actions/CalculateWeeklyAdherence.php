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
//
// Composição sobre CalculateDailyAdherence (v1.3, 2026-09-02, extraído
// daqui pro calendário mensal reusar) — soma due/taken de cada dia
// primeiro, só calcula a porcentagem final no total da semana (não é a
// média das porcentagens diárias, que arredondaria diferente).
class CalculateWeeklyAdherence
{
    public function __construct(private CalculateDailyAdherence $calculateDaily) {}

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

        $totalDue = 0;
        $totalTaken = 0;

        for ($date = $weekStart->copy(); $date->lte($today); $date->addDay()) {
            $day = $this->calculateDaily->handle($profile, $date->copy(), $schedules);
            $totalDue += $day['due'];
            $totalTaken += $day['taken'];
        }

        return [
            'taken' => $totalTaken,
            'due' => $totalDue,
            'percentage' => $totalDue > 0 ? (int) round($totalTaken / $totalDue * 100) : null,
        ];
    }
}
