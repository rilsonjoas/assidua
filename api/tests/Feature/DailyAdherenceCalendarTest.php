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

        // P2 (2026-09-25): `now()` é meia-noite de 02/09, então a dose das
        // 08:00 de hoje **ainda não venceu** — e o denominador é 0, o que
        // dá `percentage: null`, não `0`. Esta é a decisão do Rilson: o
        // dia em andamento não está "em 0%", está em aberto. Era
        // exatamente o número que brigava com o anel da Home.
        $this->assertNull($days[1]['percentage']);

        // E o 0% de verdade continua existindo: dia PASSADO, dose vencida,
        // ninguém registrou. Isso é reprovação real, não falta de dado.
        Carbon::setTestNow(Carbon::parse('2026-09-03 12:00:00', 'UTC'));
        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence?month=2026-09");
        $dia2 = collect($response->json())->firstWhere('date', '2026-09-02');
        $this->assertSame(0, $dia2['percentage'], 'Dia passado sem registro é 0% de verdade.');
    }

    // T1 (2026-09-25): antes isto se chamava "usuário grátis pedindo mês
    // além de 30 dias cai pro mês mais antigo permitido" — o clamp era
    // paywall de leitura. Rolar o próprio histórico para trás não é
    // Premium. O clamp que sobrou é só o piso técnico de
    // `HISTORY_FLOOR_DAYS`. Ver o controller.
    public function test_usuario_gratis_rola_o_calendario_para_o_proprio_historico(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence?month=2026-01");

        $days = $response->json();
        $response->assertOk();
        $this->assertSame('2026-01-01', $days[0]['date']);
    }

    // O free e o pro têm que enxergar o mesmo calendário. Se este teste
    // falhar, o paywall de leitura voltou de algum jeito.
    public function test_free_e_pro_enxergam_o_mesmo_calendario(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15', 'UTC'));

        $firstDate = [];
        foreach ([['subscription_tier' => 'free'], ['subscription_tier' => 'pro', 'subscription_expires_at' => now()->addMonth()]] as $attrs) {
            $user = User::factory()->create($attrs);
            $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

            $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/daily-adherence?month=2026-01");

            $response->assertOk();
            $firstDate[] = $response->json('0.date');
        }

        $this->assertSame($firstDate[0], $firstDate[1]);
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
