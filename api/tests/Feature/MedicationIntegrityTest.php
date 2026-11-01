<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\DoseSchedule;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MedicationIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_desativar_medicamento_dorme_horarios_e_filtra_por_padrao(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_active' => true,
        ]);
        $schedule = DoseSchedule::factory()->create([
            'medication_id' => $medication->id,
            'time' => '08:00',
            'is_active' => true,
        ]);

        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'is_active' => false,
        ])->assertOk();

        $this->assertFalse($medication->fresh()->is_active);
        $this->assertFalse($schedule->fresh()->is_active);

        // Por padrão não aparece na lista de ativos
        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/medications");
        $response->assertOk()->assertJsonCount(0);

        // Com include_inactive=1 aparece
        $responseWithInactive = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/medications?include_inactive=1");
        $responseWithInactive->assertOk()->assertJsonCount(1);
        $this->assertFalse($responseWithInactive->json('0.is_active'));
    }

    public function test_excluir_medicamento_preserva_dose_logs_com_null_on_delete(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_active' => true,
        ]);
        $schedule = DoseSchedule::factory()->create([
            'medication_id' => $medication->id,
            'time' => '08:00',
            'is_active' => true,
        ]);

        $log = DoseLog::create([
            'profile_id' => $profile->id,
            'medication_id' => $medication->id,
            'dose_schedule_id' => $schedule->id,
            'scheduled_at' => '2026-11-01 08:00:00',
            'taken_at' => '2026-11-01 08:05:00',
            'status' => 'taken',
        ]);

        // Exclui o medicamento
        $this->actingAs($user)->deleteJson("/api/medications/{$medication->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('medications', ['id' => $medication->id]);

        // O dose_log CONTINUA existindo (não foi apagado por cascade)
        $this->assertDatabaseHas('dose_logs', [
            'id' => $log->id,
            'profile_id' => $profile->id,
            'medication_id' => null,
            'status' => 'taken',
        ]);
    }
}
