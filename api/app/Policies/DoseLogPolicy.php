<?php

namespace App\Policies;

use App\Models\DoseLog;
use App\Models\Profile;
use App\Models\User;

class DoseLogPolicy
{
    /**
     * Fase 1.5 (2026-08-09): decisão de produto — cuidador aceito pode
     * "agir" (marcar tomada/pulada/desfazer), não só ver. Diferente de
     * MedicationPolicy/DoseSchedulePolicy: aqui colaborador tem o mesmo
     * nível que o dono, porque a ação é sobre uma dose específica (fácil
     * de desfazer via undo), não sobre o cadastro do medicamento.
     */
    public function create(User $user, Profile $profile): bool
    {
        return $profile->isAccessibleBy($user);
    }

    public function delete(User $user, DoseLog $doseLog): bool
    {
        return $doseLog->profile->isAccessibleBy($user);
    }

    // Mesma regra de acesso das outras ações — dono ou colaborador
    // aceito. Reagir à própria dose é permitido no controller (só não
    // dispara notificação nesse caso), não é bloqueado aqui.
    public function react(User $user, DoseLog $doseLog): bool
    {
        return $doseLog->profile->isAccessibleBy($user);
    }
}
