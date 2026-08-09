<?php

namespace App\Console\Commands;

use App\Actions\MarkDoseMissedAndNotifyCollaborators;
use App\Models\DoseLog;
use App\Models\DoseSchedule;
use Carbon\Carbon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

// Fase 1.5, Etapa 4 — versão "confiável" da detecção de dose perdida.
// DoseLogController::today() já detecta isso, mas só roda se alguém
// abrir o app; sem isso, o cuidador remoto nunca seria avisado se o
// paciente simplesmente não abrir o app naquele dia. Agendado no
// bootstrap/app.php, precisa do cron `schedule:run` rodando no VPS
// (ver hetzner-infra — não existia antes desta feature, foi adicionado
// junto).
#[Signature('doses:check-missed')]
#[Description('Marca doses passadas do horário como perdidas e notifica cuidadores (Fase 1.5)')]
class CheckMissedDoses extends Command
{
    public function handle(MarkDoseMissedAndNotifyCollaborators $markMissed): int
    {
        $today = Carbon::today();
        $dayOfWeek = (int) $today->dayOfWeek;
        $checked = 0;
        $marked = 0;

        DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('is_active', true))
            ->with(['medication.profile'])
            ->chunkById(100, function ($schedules) use ($markMissed, $today, $dayOfWeek, &$checked, &$marked) {
                foreach ($schedules as $schedule) {
                    $checked++;

                    if ($schedule->days_of_week !== null && ! in_array($dayOfWeek, $schedule->days_of_week)) {
                        continue;
                    }

                    $scheduledAt = $today->copy()->setTimeFromTimeString($schedule->time);
                    if (! $scheduledAt->isPast()) {
                        continue;
                    }

                    $exists = DoseLog::where('dose_schedule_id', $schedule->id)
                        ->whereDate('scheduled_at', $today)
                        ->exists();
                    if ($exists) {
                        continue;
                    }

                    $markMissed->handle($schedule, $schedule->medication, $schedule->medication->profile, $scheduledAt);
                    $marked++;
                }
            });

        $this->info("Checados: {$checked}. Marcados como perdidos agora: {$marked}.");

        return self::SUCCESS;
    }
}
