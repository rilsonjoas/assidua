<?php

namespace App\Actions;

use App\Models\DoseLog;
use App\Models\DoseSchedule;
use App\Models\Medication;
use App\Models\Profile;
use App\Services\ExpoPushService;
use Carbon\Carbon;

// Fase 1.5, Etapa 4 — fonte única do que acontece quando uma dose vira
// "perdida", chamada dos dois caminhos que podem detectar isso:
// DoseLogController::today() (preguiçoso, só roda se alguém abrir o
// app) e o comando agendado doses:check-missed (confiável, roda sozinho
// via cron — é o que garante que o cuidador seja avisado mesmo que o
// paciente nunca mais abra o app). Um só lugar evita as duas cópias da
// lógica divergirem com o tempo.
class MarkDoseMissedAndNotifyCollaborators
{
    public function __construct(private ExpoPushService $push) {}

    public function handle(DoseSchedule $schedule, Medication $medication, Profile $profile, Carbon $scheduledAt): DoseLog
    {
        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt,
            'taken_at' => null,
            'status' => 'missed',
        ]);

        $this->notifyCollaborators($profile, $medication, $scheduledAt);

        return $log;
    }

    private function notifyCollaborators(Profile $profile, Medication $medication, Carbon $scheduledAt): void
    {
        $collaborators = $profile->collaborators()->accepted()->with('user.pushTokens')->get();

        foreach ($collaborators as $collaborator) {
            $user = $collaborator->user;
            if (! $user) {
                continue;
            }

            foreach ($user->pushTokens as $pushToken) {
                $this->push->send(
                    $pushToken->token,
                    'Dose perdida',
                    sprintf(
                        '%s não tomou %s às %s.',
                        $profile->name,
                        $medication->name,
                        $scheduledAt->format('H:i'),
                    ),
                    ['profileId' => $profile->id, 'medicationId' => $medication->id],
                );
            }
        }
    }
}
