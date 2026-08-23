<?php

namespace App\Actions;

use App\Models\Profile;
use App\Services\ExpoPushService;

// "Resumo semanal" (Fase 2, 2026-08-13). Manda pro dono do perfil um
// resumo de "como foi a sua semana" — diferente do alerta de dose
// perdida (esse já existe e já vai pro cuidador desde a Fase 1.5, é
// negativo por natureza). Não manda nada se não tinha nenhuma dose
// prevista essa semana — resumo vazio não ajuda ninguém, só é ruído.
//
// Cuidador também recebe, mas uma mensagem DIFERENTE (2026-08-22,
// ideia de produto: cuidador remoto só ouve do app quando algo dá
// errado — o alerta de dose perdida. Nunca ouve quando dá certo. Isso
// é o oposto do que a Assídua deveria ser: aliviar a culpa de quem
// cuida à distância, não só apontar falha). Mesma % calculada uma
// única vez, duas leituras: pro dono é "como fui essa semana"; pro
// cuidador é uma afirmação sobre o cuidado dele mesmo, não um
// relatório frio sobre a outra pessoa.
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

        $sentToOwner = $this->sendToOwner($profile, $result);
        $sentToCollaborators = $this->sendToCollaborators($profile, $result);

        return $sentToOwner || $sentToCollaborators;
    }

    private function sendToOwner(Profile $profile, array $result): bool
    {
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

    private function sendToCollaborators(Profile $profile, array $result): bool
    {
        $collaborators = $profile->collaborators()->accepted()->with('user.pushTokens')->get();
        if ($collaborators->isEmpty()) {
            return false;
        }

        // Afirmação, não relatório — quem cuida à distância carrega
        // culpa por não estar presente fisicamente; a mensagem existe
        // pra contrapor isso, não só informar um número.
        $body = sprintf(
            'Essa semana, %s tomou %d de %d doses — você está fazendo diferença.',
            $profile->name,
            $result['taken'],
            $result['due'],
        );

        $sent = false;
        foreach ($collaborators as $collaborator) {
            foreach ($collaborator->user->pushTokens as $token) {
                $this->push->send(
                    $token->token,
                    "Cuidando de {$profile->name}",
                    $body,
                    ['profileId' => $profile->id, 'type' => 'weekly_summary_caregiver'],
                );
                $sent = true;
            }
        }

        return $sent;
    }
}
