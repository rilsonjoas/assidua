<?php

namespace App\Policies;

use App\Models\Medication;
use App\Models\User;

class MedicationPolicy
{
    /**
     * Dono é quem é dono do perfil ao qual o medicamento pertence
     * (medication -> profile -> user), não uma coluna direta em Medication.
     */
    public function view(User $user, Medication $medication): bool
    {
        return $medication->profile->user_id === $user->id;
    }

    public function update(User $user, Medication $medication): bool
    {
        return $this->view($user, $medication);
    }

    public function delete(User $user, Medication $medication): bool
    {
        return $this->view($user, $medication);
    }
}
