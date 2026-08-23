<?php

namespace App\Actions;

use App\Models\DoseLog;
use App\Models\User;
use App\Services\ExpoPushService;

// "Reação do cuidador" (2026-08-22, ideia de produto). Um toque do
// cuidador quando vê que a dose foi tomada — vira sinal de presença
// pra quem tomou o remédio, não só monitoramento silencioso. Um
// reator por dose (sobrescreve se reagir de novo), sem feed de
// reações — é 1 toque, não um chat.
class ReactToDoseLog
{
    public function __construct(private ExpoPushService $push) {}

    public function handle(DoseLog $doseLog, User $reactor): void
    {
        $doseLog->update([
            'reacted_by_user_id' => $reactor->id,
            'reacted_at' => now(),
        ]);

        // Não notifica quem reagiu à própria dose (não faz sentido
        // "alguém pensou em você" quando esse alguém é você mesmo).
        $owner = $doseLog->profile->user;
        if ($owner->id === $reactor->id) {
            return;
        }

        foreach ($owner->pushTokens as $token) {
            $this->push->send(
                $token->token,
                'Alguém pensou em você',
                "{$reactor->name} viu que você tomou seu remédio e mandou um ❤️.",
                ['doseLogId' => $doseLog->id, 'type' => 'dose_reaction'],
            );
        }
    }
}
