<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogDestroyTest extends TestCase
{
    use RefreshDatabase;

    public function test_apaga_dose_registrada_por_engano(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $response = $this->actingAs($user)->deleteJson("/api/dose-logs/{$log->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('dose_logs', ['id' => $log->id]);
    }

    public function test_dose_apagada_volta_a_aparecer_como_pendente_em_today(): void
    {
        // Horário do schedule precisa ficar no futuro em relação a "agora"
        // pra continuar pendente depois do undo — se já tivesse passado,
        // voltaria "missed" automaticamente (comportamento correto, ver
        // DoseLogTodayTest::test_marca_dose_como_perdida...).
        Carbon::setTestNow(Carbon::parse('2026-07-15 06:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $this->actingAs($user)->deleteJson("/api/dose-logs/{$log->id}")->assertNoContent();

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk();
        $response->assertJsonFragment([
            // Sufixo HHmm (2026-08-14) — evita colisão de id entre
            // ocorrências do mesmo schedule no dia (frequência de horário).
            'id' => 'pending_' . $schedule->id . '_0800',
            'status' => 'pending',
        ]);

        Carbon::setTestNow();
    }

    public function test_nao_permite_apagar_dose_de_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $response = $this->actingAs($intruder)->deleteJson("/api/dose-logs/{$log->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('dose_logs', ['id' => $log->id]);
    }
}
