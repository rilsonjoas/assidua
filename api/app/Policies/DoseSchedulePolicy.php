<?php

namespace App\Policies;

use App\Models\DoseSchedule;
use App\Models\User;

class DoseSchedulePolicy
{
    /**
     * Dono é quem é dono do perfil, via schedule -> medication -> profile -> user.
     */
    public function view(User $user, DoseSchedule $schedule): bool
    {
        return $schedule->medication->profile->user_id === $user->id;
    }

    public function update(User $user, DoseSchedule $schedule): bool
    {
        return $this->view($user, $schedule);
    }

    public function delete(User $user, DoseSchedule $schedule): bool
    {
        return $this->view($user, $schedule);
    }
}
