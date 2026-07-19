<?php

namespace Database\Factories;

use App\Models\DoseSchedule;
use App\Models\Medication;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DoseSchedule>
 */
class DoseScheduleFactory extends Factory
{
    protected $model = DoseSchedule::class;

    public function definition(): array
    {
        return [
            'medication_id' => Medication::factory(),
            'time' => '08:00:00',
            'days_of_week' => null,
            'interval_hours' => null,
            'is_active' => true,
        ];
    }
}
