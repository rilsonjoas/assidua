<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// "Calendário de adesão" (v1.3, aprovado 2026-09-02) — endpoint que
// agrega CalculateDailyAdherence por dia. O cálculo em si já tem
// cobertura própria em CalculateDailyAdherenceTest; aqui é o endpoint
// (mês default vs. explícito, teto de profundidade grátis/Pro, formato).
class DailyAdherenceCalendarTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_sem_parametro_mes_usa_o_mes_atual_ate_hoje_sem_dias_futuros(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-02', 'UTC')); // dia 2 do mês

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence");

        $days = $response->json();
        $response->assertOk();
        $this->assertCount(2, $days); // só 1 e 2 de setembro, nada depois de hoje
        $this->assertSame('2026-09-01', $days[0]['date']);
        $this->assertSame('2026-09-02', $days[1]['date']);
    }

    public function test_mes_explicito_no_passado_retorna_o_mes_inteiro(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence?month=2026-08");

        $days = $response->json();
        $response->assertOk();
        $this->assertCount(31, $days); // agosto tem 31 dias
        $this->assertSame('2026-08-01', $days[0]['date']);
        $this->assertSame('2026-08-31', $days[30]['date']);
    }

    public function test_dia_tomado_por_completo_marca_100_e_dia_sem_marcar_fica_0(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-02', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::parse('2026-09-01 08:00:00', 'UTC'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);
        // dia 2 fica sem log nenhum.

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence");

        $days = $response->json();
        $this->assertSame('2026-09-01', $days[0]['date']);
        $this->assertSame(100, $days[0]['percentage']);
        $this->assertSame('2026-09-02', $days[1]['date']);
        $this->assertSame(0, $days[1]['percentage']);
    }

    public function test_usuario_gratis_pedindo_mes_alem_de_30_dias_cai_pro_mes_mais_antigo_permitido(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        // Pede janeiro (bem além dos 30 dias grátis) — clampa pro mês
        // mais antigo que ainda cabe na janela de 30 dias.
        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence?month=2026-01");

        $days = $response->json();
        $response->assertOk();
        $this->assertNotSame('2026-01-01', $days[0]['date']);
        // Janela de 30 dias a partir de 15/09 volta pro dia 16/08 —
        // início do mês correspondente é agosto, não janeiro.
        $this->assertSame('2026-08-01', $days[0]['date']);
    }

    public function test_usuario_pro_pode_pedir_mes_bem_antigo(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'pro', 'subscription_expires_at' => now()->addMonth()]);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence?month=2026-01");

        $days = $response->json();
        $response->assertOk();
        $this->assertSame('2026-01-01', $days[0]['date']);
    }

    public function test_retorna_403_para_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($intruder)->getJson("/api/profiles/{$profile->id}/daily-adherence");

        $response->assertForbidden();
    }
}
