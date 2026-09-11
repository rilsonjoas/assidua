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
//
// Tolerância de 24h antes de marcar "Perdido" (2026-09-11, entrevista
// de decisões de horário no ROADMAP.md — item 15/23) — antes disto era
// instantâneo (`isPast()` cru). Abaixo de 24h de atraso, o app mostra
// "Atrasado" (estado 100% calculado no CLIENTE, este comando nem sabe
// que existe); só depois de 24h de verdade este comando marca como
// "Perdido" de fato no banco.
#[Signature('doses:check-missed')]
#[Description('Marca doses passadas do horário (com tolerância de 24h) como perdidas e notifica cuidadores (Fase 1.5)')]
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

                    // Achado real (2026-09-11, junto da tolerância de
                    // 24h): este comando roda de 15 em 15min e sempre
                    // calculava "hoje" fresco a cada execução — uma
                    // ocorrência tarde da noite (ex.: 23:50) só completa
                    // 24h de atraso já no dia SEGUINTE, quando "hoje" pro
                    // comando já virou outro dia e essa ocorrência nunca
                    // mais aparecia em `generateOccurrences->handle($schedule,
                    // $today)` — ficava perdida (sem marcar "Perdido") pra
                    // sempre. Olha ONTEM também, não só hoje.
                    $occurrences = [
                        ...$generateOccurrences->handle($schedule, $today->copy()->subDay()),
                        ...$generateOccurrences->handle($schedule, $today),
                    ];

                    foreach ($occurrences as $scheduledAt) {
                        if (! $scheduledAt->copy()->addHours(DoseLog::MISSED_TOLERANCE_HOURS)->isPast()) {
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
