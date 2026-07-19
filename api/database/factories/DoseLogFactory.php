<?php

namespace Database\Factories;

use App\Models\DoseLog;
use App\Models\DoseSchedule;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DoseLog>
 */
class DoseLogFactory extends Factory
{
    protected $model = DoseLog::class;

    public function definition(): array
    {
        $schedule = DoseSchedule::factory()->create();

        return [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $schedule->medication_id,
            'profile_id' => $schedule->medication->profile_id,
            'scheduled_at' => now(),
            'taken_at' => null,
            'status' => 'missed',
            'notes' => null,
        ];
    }
}
