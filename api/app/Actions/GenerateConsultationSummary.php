<?php

namespace App\Actions;

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
    public function __construct(private GenerateScheduleOccurrences $generateOccurrences) {}

    public function handle(Profile $profile, int $days): array
    {
        $today = Carbon::today($profile->timezone);
        $periodStart = $today->copy()->subDays($days - 1);

        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id))
            ->with('medication:id,name')
            ->get();

        $totalDue = 0;
        $totalTaken = 0;
        $missed = [];

        $cursor = $periodStart->copy();
        while ($cursor->lte($today)) {
            foreach ($schedules as $schedule) {
                foreach ($this->generateOccurrences->handle($schedule, $cursor) as $scheduledAt) {
                    if ($scheduledAt->gt(now())) {
                        continue; // ainda não chegou a hora, não conta como devido
                    }

                    $totalDue++;

                    $log = $schedule->doseLogs()
                        ->where('scheduled_at', $scheduledAt->format('Y-m-d H:i:s'))
                        ->first();

                    if ($log?->status === 'taken') {
                        $totalTaken++;
                    } elseif ($log?->status !== 'skipped') {
                        // Ausência de log OU status 'missed' contam como
                        // perdida pro médico — "pulado de propósito" (skip)
                        // é decisão informada, não falha, por isso fora
                        // da lista de perdidas.
                        $missed[] = [
                            'medication_name' => $schedule->medication->name,
                            'scheduled_at' => $scheduledAt->toIso8601String(),
                        ];
                    }
                }
            }
            $cursor->addDay();
        }

        return [
            'period_days' => $days,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $today->toDateString(),
            'percentage' => $totalDue > 0 ? (int) round(($totalTaken / $totalDue) * 100) : null,
            'taken' => $totalTaken,
            'due' => $totalDue,
            'missed' => $missed,
        ];
    }
}
