<?php

namespace Tests\Feature;

use App\Models\DoseSchedule;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseScheduleTest extends TestCase
{
    use RefreshDatabase;

    public function test_cria_schedule_para_medicamento_do_proprio_usuario(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '08:00',
            'days_of_week' => [1, 3, 5],
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('dose_schedules', [
            'medication_id' => $medication->id,
        ]);
    }

    public function test_nao_permite_criar_schedule_em_medicamento_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($intruder)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '08:00',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('dose_schedules', 0);
    }

    public function test_rejeita_horario_em_formato_invalido(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '25:99',
        ]);

        $response->assertUnprocessable();
    }

    public function test_rejeita_dia_da_semana_fora_do_intervalo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '08:00',
            'days_of_week' => [7],
        ]);

        $response->assertUnprocessable();
    }

    public function test_atualiza_horario_e_dias_de_schedule_existente(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->putJson("/api/schedules/{$schedule->id}", [
            'time' => '21:30',
            'days_of_week' => [0, 6],
        ]);

        $response->assertOk();
        $schedule->refresh();
        // Comparado via Carbon porque SQLite (usado nos testes) não normaliza o formato
        // de colunas TIME como o MySQL (produção) faz.
        $this->assertSame('21:30:00', Carbon::parse($schedule->time)->format('H:i:s'));
        $this->assertSame([0, 6], $schedule->days_of_week);
    }

    public function test_nao_permite_atualizar_schedule_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($intruder)->putJson("/api/schedules/{$schedule->id}", [
            'time' => '09:00',
        ]);

        $response->assertForbidden();
    }

    public function test_remove_schedule(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->deleteJson("/api/schedules/{$schedule->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('dose_schedules', ['id' => $schedule->id]);
    }

    public function test_nao_permite_remover_schedule_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($intruder)->deleteJson("/api/schedules/{$schedule->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('dose_schedules', ['id' => $schedule->id]);
    }
}
