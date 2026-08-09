<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// Fase 1.5, Etapa 4 — o comando é o que garante o alerta mesmo sem
// ninguém abrir o app (diferente de today(), que só roda sob demanda).
class CheckMissedDosesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_marca_como_perdida_dose_de_horario_ja_passado(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'status' => 'missed',
        ]);
    }

    public function test_nao_mexe_em_dose_de_horario_futuro(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-15 06:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(0, DoseLog::count());
    }

    public function test_nao_duplica_log_ja_existente(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(1, DoseLog::where('dose_schedule_id', $schedule->id)->count());
        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'taken']);
    }

    public function test_ignora_medicamento_inativo(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(0, DoseLog::count());
    }
}
