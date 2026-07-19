<?php

namespace Database\Factories;

use App\Models\Medication;
use App\Models\Profile;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Medication>
 */
class MedicationFactory extends Factory
{
    protected $model = Medication::class;

    public function definition(): array
    {
        return [
            'profile_id' => Profile::factory(),
            'name' => fake()->word(),
            'dosage' => '10',
            'unit' => 'mg',
            'color' => '#6366f1',
            'instructions' => null,
            'notes' => null,
            'is_active' => true,
        ];
    }
}
