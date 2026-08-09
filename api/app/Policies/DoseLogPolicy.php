<?php

namespace App\Policies;

use App\Models\DoseLog;
use App\Models\User;

class DoseLogPolicy
{
    /**
     * DoseLog não tem user_id direto — dono é quem é dono do perfil ao
     * qual a dose pertence.
     */
    public function delete(User $user, DoseLog $doseLog): bool
    {
        return $doseLog->profile->user_id === $user->id;
    }
}
