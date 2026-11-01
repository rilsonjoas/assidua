<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MedicationMaxDailyDosesTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_and_update_medication_with_max_daily_doses(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Paracetamol 500mg',
            'is_prn' => true,
            'max_daily_doses' => 4,
        ]);

        $response->assertCreated();
        $response->assertJson([
            'name' => 'Paracetamol 500mg',
            'is_prn' => true,
            'max_daily_doses' => 4,
            'today_prn_doses_count' => 0,
        ]);

        $medicationId = $response->json('id');

        $updateResponse = $this->actingAs($user)->putJson("/api/medications/{$medicationId}", [
            'max_daily_doses' => 6,
        ]);

        $updateResponse->assertOk();
        $this->assertSame(6, $updateResponse->json('max_daily_doses'));
    }

    public function test_counts_today_taken_prn_doses_correctly(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);

        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
            'max_daily_doses' => 4,
        ]);

        $today = Carbon::today('America/Sao_Paulo')->toDateString();

        // 2 doses tomadas hoje
        $medication->doseLogs()->create([
            'profile_id' => $profile->id,
            'status' => 'taken',
            'taken_at' => "{$today} 08:30:00",
            'client_key' => fake()->uuid(),
        ]);
        $medication->doseLogs()->create([
            'profile_id' => $profile->id,
            'status' => 'taken',
            'taken_at' => "{$today} 14:00:00",
            'client_key' => fake()->uuid(),
        ]);

        // 1 dose tomada ontem (não deve contar para hoje)
        $yesterday = Carbon::yesterday('America/Sao_Paulo')->toDateString();
        $medication->doseLogs()->create([
            'profile_id' => $profile->id,
            'status' => 'taken',
            'taken_at' => "{$yesterday} 20:00:00",
            'client_key' => fake()->uuid(),
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/medications");
        $response->assertOk();

        $medJson = collect($response->json())->firstWhere('id', $medication->id);
        $this->assertEquals(2, $medJson['today_prn_doses_count']);
        $this->assertEquals(4, $medJson['max_daily_doses']);
    }
}
