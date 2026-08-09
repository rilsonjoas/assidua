<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MedicationDaysRemainingTest extends TestCase
{
    use RefreshDatabase;

    public function test_calcula_dias_restantes_com_uma_dose_diaria(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $medication->stock()->create(['current_quantity' => 30, 'min_alert_quantity' => 5]);

        $response = $this->actingAs($user)->getJson("/api/medications/{$medication->id}");

        $response->assertOk();
        $response->assertJsonFragment(['days_remaining' => 30]);
    }

    public function test_calcula_dias_restantes_com_multiplas_doses_diarias(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null]);
        $medication->stock()->create(['current_quantity' => 30, 'min_alert_quantity' => 5]);

        $response = $this->actingAs($user)->getJson("/api/medications/{$medication->id}");

        $response->assertOk();
        $response->assertJsonFragment(['days_remaining' => 15]);
    }

    public function test_considera_dias_da_semana_restritos_na_media(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // Só segunda/quarta/sexta = 3 doses por semana, média 3/7 ao dia
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [1, 3, 5]]);
        $medication->stock()->create(['current_quantity' => 21, 'min_alert_quantity' => 5]);

        $response = $this->actingAs($user)->getJson("/api/medications/{$medication->id}");

        $response->assertOk();
        // 21 / (3/7) = 49
        $response->assertJsonFragment(['days_remaining' => 49]);
    }

    public function test_days_remaining_nulo_sem_schedule_ativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->stock()->create(['current_quantity' => 30, 'min_alert_quantity' => 5]);

        $response = $this->actingAs($user)->getJson("/api/medications/{$medication->id}");

        $response->assertOk();
        $response->assertJsonFragment(['days_remaining' => null]);
    }
}
