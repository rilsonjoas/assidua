<?php

namespace App\Policies;

use App\Models\Medication;
use App\Models\User;

class MedicationPolicy
{
    /**
     * Fase 1.5 (2026-08-09): view abre pra colaborador aceito do perfil
     * (via medication -> profile). update/delete continuam só do dono —
     * editar/apagar o cadastro do remédio é gerenciamento, diferente de
     * agir sobre uma dose (isso é DoseLogPolicy).
     */
    public function view(User $user, Medication $medication): bool
    {
        return $medication->profile->isAccessibleBy($user);
    }

    public function update(User $user, Medication $medication): bool
    {
        return $medication->profile->user_id === $user->id;
    }

    public function delete(User $user, Medication $medication): bool
    {
        return $this->update($user, $medication);
    }

    /**
     * Atualizar quantidade em estoque é uma ação de cuidador (reabastecer),
     * não gerenciamento do cadastro — colaborador tem o mesmo nível do
     * dono aqui, diferente de update()/delete() acima.
     */
    public function manageStock(User $user, Medication $medication): bool
    {
        return $medication->profile->isAccessibleBy($user);
    }
}
