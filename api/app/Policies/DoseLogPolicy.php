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

    /**
     * P3 (2026-09-25) — editar a nota tem **a mesma regra** que marcar
     * tomada, pulada ou apagar: dono ou colaborador aceito.
     *
     * Deliberadamente igual ao `delete`, e não mais restrito. A nota é
     * parte do registro da dose, e quem pode desfazer o registro pode
     * corrigi-lo — inclusive o cuidador, que é quem mais tarde vai
     * escrever ali ("a mãe passou mal depois do almoço"). Restringir o
     * cuidador da nota mas dar poder de apagar a dose seria um poder
     * incoerente.
     */
    public function update(User $user, DoseLog $doseLog): bool
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
