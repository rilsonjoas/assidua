<?php

namespace Database\Factories;

use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ProfileCollaborator>
 */
class ProfileCollaboratorFactory extends Factory
{
    protected $model = ProfileCollaborator::class;

    public function definition(): array
    {
        return [
            'profile_id' => Profile::factory(),
            'invited_by_user_id' => User::factory(),
            'user_id' => null,
            'role' => 'viewer',
            'invite_code' => Str::random(8),
            'accepted_at' => null,
        ];
    }

    public function accepted(): static
    {
        return $this->state(fn () => [
            'user_id' => User::factory(),
            'invite_code' => null,
            'accepted_at' => now(),
        ]);
    }
}
