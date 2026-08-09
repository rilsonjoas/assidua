<?php

namespace App\Policies;

use App\Models\Profile;
use App\Models\User;

class ProfilePolicy
{
    /**
     * Fase 1.5 (2026-08-09): view abre pra colaborador aceito, não só
     * dono — é o que faz o cuidador remoto conseguir ver o perfil.
     * update/delete continuam exclusivos do dono (gerenciar o perfil em
     * si — renomear, apagar, convidar/revogar cuidador — é mais sensível
     * que ver/agir sobre doses, ver DoseLogPolicy/StockPolicy pra isso).
     */
    public function view(User $user, Profile $profile): bool
    {
        return $profile->isAccessibleBy($user);
    }

    public function update(User $user, Profile $profile): bool
    {
        return $profile->user_id === $user->id;
    }

    public function delete(User $user, Profile $profile): bool
    {
        return $this->update($user, $profile);
    }
}
