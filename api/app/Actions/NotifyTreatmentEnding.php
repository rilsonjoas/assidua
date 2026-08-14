<?php

namespace App\Actions;

use App\Models\Medication;
use App\Services\ExpoPushService;

// "Duração do tratamento" (2026-08-14) — decisão de produto confirmada
// com o Rilson: quando os dias acabarem, só avisar, nunca pausar
// sozinho. Mesmo padrão de SendWeeklyAdherenceSummary — manda só pro
// dono do perfil, não pros cuidadores (é aviso informativo, não alerta
// de dose perdida).
class NotifyTreatmentEnding
{
    public function __construct(private ExpoPushService $push) {}

    public function handle(Medication $medication): bool
    {
        $tokens = $medication->profile->user->pushTokens;
        if ($tokens->isEmpty()) {
            return false;
        }

        foreach ($tokens as $token) {
            $this->push->send(
                $token->token,
                'Tratamento chegando ao fim',
                sprintf(
                    'O tratamento com %s (%s) termina hoje. O remédio continua ativo até você decidir pausar ou apagar.',
                    $medication->name,
                    $medication->profile->name,
                ),
                ['profileId' => $medication->profile_id, 'medicationId' => $medication->id, 'type' => 'treatment_ending'],
            );
        }

        return true;
    }
}
