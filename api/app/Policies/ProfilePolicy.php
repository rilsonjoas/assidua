<?php

namespace App\Policies;

use App\Models\Profile;
use App\Models\User;

class ProfilePolicy
{
    /**
     * Único critério de dono em todo o app: o perfil pertence ao usuário
     * autenticado. Usado pra view/update/delete — não há regra diferente
     * por ação, então um método só cobre as três.
     */
    public function view(User $user, Profile $profile): bool
    {
        return $profile->user_id === $user->id;
    }

    public function update(User $user, Profile $profile): bool
    {
        return $this->view($user, $profile);
    }

    public function delete(User $user, Profile $profile): bool
    {
        return $this->view($user, $profile);
    }
}
