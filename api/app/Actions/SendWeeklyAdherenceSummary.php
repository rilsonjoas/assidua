<?php

namespace App\Actions;

use App\Models\Profile;
use App\Services\ExpoPushService;

// "Resumo semanal" (Fase 2, 2026-08-13). Manda só pro dono do perfil
// (não pros cuidadores) — é um resumo de "como foi a sua semana", não
// um alerta de dose perdida (esse já existe e já vai pro cuidador desde
// a Fase 1.5). Não manda nada se não tinha nenhuma dose prevista essa
// semana — resumo vazio não ajuda ninguém, só é ruído.
class SendWeeklyAdherenceSummary
{
    public function __construct(
        private CalculateWeeklyAdherence $calculateAdherence,
        private ExpoPushService $push,
    ) {}

    public function handle(Profile $profile): bool
    {
        $result = $this->calculateAdherence->handle($profile);

        if ($result['due'] === 0) {
            return false;
        }

        $tokens = $profile->user->pushTokens;
        if ($tokens->isEmpty()) {
            return false;
        }

        $body = sprintf(
            '%d%% de adesão essa semana (%d de %d doses tomadas).',
            $result['percentage'],
            $result['taken'],
            $result['due'],
        );

        foreach ($tokens as $token) {
            $this->push->send(
                $token->token,
                "Resumo da semana — {$profile->name}",
                $body,
                ['profileId' => $profile->id, 'type' => 'weekly_summary'],
            );
        }

        return true;
    }
}
