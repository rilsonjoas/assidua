<?php

namespace App\Console\Commands;

use App\Actions\GenerateScheduleOccurrences;
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
    public function handle(MarkDoseMissedAndNotifyCollaborators $markMissed, GenerateScheduleOccurrences $generateOccurrences): int
    {
        // Achado 2026-08-10: "hoje" era calculado uma vez, em UTC, pra
        // todos os perfis de uma vez — cada perfil pode estar em fuso
        // diferente (Brasil sozinho já tem 4), então precisa recalcular
        // "hoje" por perfil, não uma vez só no topo.
        $checked = 0;
        $marked = 0;

        DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('is_active', true)->where('is_paused', false))
            ->with(['medication.profile'])
            ->chunkById(100, function ($schedules) use ($markMissed, $generateOccurrences, &$checked, &$marked) {
                foreach ($schedules as $schedule) {
                    $checked++;

                    $profile = $schedule->medication->profile;
                    $today = Carbon::today($profile->timezone);

                    // "Frequência de horário" (2026-08-14): mesma Action
                    // usada em DoseLogController::today() — um schedule
                    // pode gerar mais de uma ocorrência perdível no dia.
                    $occurrences = $generateOccurrences->handle($schedule, $today);

                    foreach ($occurrences as $scheduledAt) {
                        if (! $scheduledAt->isPast()) {
                            continue;
                        }

                        $exists = DoseLog::where('dose_schedule_id', $schedule->id)
                            ->where('scheduled_at', $scheduledAt->format('Y-m-d H:i:s'))
                            ->exists();
                        if ($exists) {
                            continue;
                        }

                        $markMissed->handle($schedule, $schedule->medication, $profile, $scheduledAt);
                        $marked++;
                    }
                }
            });

        $this->info("Checados: {$checked}. Marcados como perdidos agora: {$marked}.");

        return self::SUCCESS;
    }
}
