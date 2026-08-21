<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogStoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_registra_dose_tomada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $scheduledAt = Carbon::today()->setTimeFromTimeString('08:00:00');

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt->toISOString(),
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'status' => 'taken',
        ]);
        $this->assertSame(1, DoseLog::count());
    }

    public function test_reenviar_mesma_dose_atualiza_em_vez_de_duplicar(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $scheduledAt = Carbon::today()->setTimeFromTimeString('08:00:00');

        $payload = [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt->toISOString(),
            'status' => 'taken',
        ];

        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();

        // Usuário muda de ideia e marca como pulado — mesmo schedule + horário.
        $response = $this->actingAs($user)->postJson('/api/dose-logs', array_merge($payload, [
            'status' => 'skipped',
        ]));

        $response->assertCreated();
        $this->assertSame(1, DoseLog::count());
        $this->assertDatabaseHas('dose_logs', ['status' => 'skipped']);
    }

    public function test_nao_permite_registrar_dose_de_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($intruder)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertForbidden();
        $this->assertSame(0, DoseLog::count());
    }

    public function test_rejeita_status_invalido(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'invalido',
        ]);

        $response->assertUnprocessable();
    }

    public function test_registra_dose_tomada_decrementa_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ])->assertCreated();

        $this->assertEquals(9, $stock->fresh()->current_quantity);
    }

    public function test_registra_dose_pulada_nao_altera_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'skipped',
        ])->assertCreated();

        $this->assertEquals(10, $stock->fresh()->current_quantity);
    }

    public function test_alterar_dose_de_tomada_para_pulada_estorna_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $payload = [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ];

        // 10 -> 9
        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();
        $this->assertEquals(9, $stock->fresh()->current_quantity);

        // 9 -> 10 (status alterado para skipped)
        $this->actingAs($user)->postJson('/api/dose-logs', array_merge($payload, ['status' => 'skipped']))->assertCreated();
        $this->assertEquals(10, $stock->fresh()->current_quantity);
    }

    public function test_alterar_dose_de_pulada_para_tomada_decrementa_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $payload = [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'skipped',
        ];

        // 10 -> 10 (skipped)
        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();
        $this->assertEquals(10, $stock->fresh()->current_quantity);

        // 10 -> 9 (status alterado para taken)
        $this->actingAs($user)->postJson('/api/dose-logs', array_merge($payload, ['status' => 'taken']))->assertCreated();
        $this->assertEquals(9, $stock->fresh()->current_quantity);
    }
}
