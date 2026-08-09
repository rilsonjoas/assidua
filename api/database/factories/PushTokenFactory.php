<?php

namespace Database\Factories;

use App\Models\PushToken;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PushToken>
 */
class PushTokenFactory extends Factory
{
    protected $model = PushToken::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'token' => 'ExponentPushToken[' . fake()->uuid() . ']',
            'platform' => fake()->randomElement(['ios', 'android']),
            'last_used_at' => now(),
        ];
    }
}
