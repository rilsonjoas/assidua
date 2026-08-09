<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogTodayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Congela em uma quarta-feira (dayOfWeek = 3) para os testes de days_of_week serem determinísticos.
        Carbon::setTestNow(Carbon::parse('2026-07-15 00:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_lista_dose_pendente_para_schedule_sem_restricao_de_dias(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment([
            'status' => 'pending',
            'dose_schedule_id' => $schedule->id,
            'id' => "pending_{$schedule->id}",
        ]);
    }

    public function test_exclui_schedule_cujo_dia_da_semana_nao_e_hoje(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // hoje é quarta (3); agenda só para segunda (1)
        $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => [1],
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_inclui_schedule_cujo_dia_da_semana_e_hoje(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => [3], // quarta
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['dose_schedule_id' => $schedule->id]);
    }

    public function test_reflete_log_ja_registrado_para_hoje(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
        ]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00'),
            'taken_at' => Carbon::now(),
            'status' => 'taken',
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment([
            'id' => $log->id,
            'status' => 'taken',
        ]);
    }

    public function test_ignora_medicamento_inativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_ignora_schedule_inativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => false]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_retorna_403_para_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertForbidden();
    }

    public function test_marca_dose_como_perdida_quando_horario_ja_passou(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00', // já passou às 10h
            'days_of_week' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['status' => 'missed']);
        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'status' => 'missed',
        ]);
    }

    public function test_dose_perdida_continua_com_horario_futuro_como_pendente(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create([
            'time' => '20:00:00', // ainda não chegou às 10h
            'days_of_week' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['status' => 'pending']);
    }

    public function test_dose_perdida_ainda_pode_ser_marcada_como_tomada_depois(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // Abre o app às 10h — vira "missed" automaticamente.
        $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");
        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'missed']);

        // Usuário percebe e marca como tomada mesmo assim, atrasada.
        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $this->assertSame(1, DoseLog::where('dose_schedule_id', $schedule->id)->count());
        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'taken']);
    }

    public function test_ordena_doses_por_horario(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk();
        $times = collect($response->json())->pluck('scheduled_at');
        $this->assertTrue($times->first() < $times->last());
    }
}
