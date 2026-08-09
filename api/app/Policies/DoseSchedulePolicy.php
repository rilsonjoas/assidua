<?php

namespace App\Policies;

use App\Models\DoseSchedule;
use App\Models\User;

class DoseSchedulePolicy
{
    /**
     * Fase 1.5 (2026-08-09): view abre pra colaborador aceito (via
     * schedule -> medication -> profile). update/delete (criar/editar
     * horário) continuam só do dono — mesmo raciocínio da MedicationPolicy.
     */
    public function view(User $user, DoseSchedule $schedule): bool
    {
        return $schedule->medication->profile->isAccessibleBy($user);
    }

    public function update(User $user, DoseSchedule $schedule): bool
    {
        return $schedule->medication->profile->user_id === $user->id;
    }

    public function delete(User $user, DoseSchedule $schedule): bool
    {
        return $this->update($user, $schedule);
    }
}
