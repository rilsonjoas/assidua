<?php

namespace Tests\Feature;

use App\Actions\CalculateAdherenceStreak;
use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// Fase 2 (2026-08-12) — "Pausar medicamento". Deliberadamente um campo
// novo (`is_paused`), não reaproveita `is_active` — ver comentário na
// migration. Perfis em UTC pela mesma razão de sempre nesta suíte.
class MedicationPauseTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_pausa_medicamento_via_update(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'is_paused' => true,
        ]);

        $response->assertOk()->assertJson(['is_paused' => true]);
        $this->assertDatabaseHas('medications', ['id' => $medication->id, 'is_paused' => true]);
    }

    public function test_medicamento_pausado_continua_na_lista_de_remedios(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/medications");

        // Diferente de is_active=false: continua na lista (com o selo
        // sendo responsabilidade do app), só não gera dose.
        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['id' => $medication->id, 'is_paused' => true]);
    }

    public function test_medicamento_pausado_nao_aparece_na_tela_hoje(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-12 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_reativar_medicamento_volta_a_gerar_dose_hoje(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-12 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", ['is_paused' => false])
            ->assertOk();

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
    }

    public function test_medicamento_pausado_nao_vira_perdido_pelo_comando_agendado(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-12 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(0, DoseLog::count());
    }

    public function test_dia_com_medicamento_pausado_e_neutro_pro_streak_nao_quebra(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-12 20:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        // Medicamento A: ativo, tomado direitinho nos últimos 3 dias.
        $medA = Medication::factory()->create(['profile_id' => $profile->id]);
        $scheduleA = $medA->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        foreach ([0, 1, 2] as $daysAgo) {
            DoseLog::create([
                'dose_schedule_id' => $scheduleA->id,
                'medication_id' => $medA->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $today->copy()->subDays($daysAgo)->setTimeFromTimeString('08:00:00'),
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        // Medicamento B: pausado, sem log nenhum — não pode contar como quebra.
        $medB = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medB->schedules()->create(['time' => '12:00:00', 'days_of_week' => null]);

        $streak = app(CalculateAdherenceStreak::class)->handle($profile->fresh());

        $this->assertSame(3, $streak['current_streak']);
    }
}
