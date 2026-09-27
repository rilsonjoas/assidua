<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// "Gráfico de adesão" (Fase 2, 2026-08-13) — endpoint que agrega
// CalculateWeeklyAdherence por semana. O cálculo em si já tem cobertura
// própria em CalculateWeeklyAdherenceTest; aqui é o endpoint (paginação
// por semanas, paywall grátis/Pro, formato da resposta).
class WeeklyAdherenceChartTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // T1 (2026-09-25): antes o free via 4 semanas e o Pro 8. A diferença
    // era densidade de apresentação, não acesso a dado — o gráfico lê a
    // mesma tabela do histórico, que agora é inteira e pública pro dono.
    // Free e Pro enxergam as mesmas 8 semanas.
    public function test_usuario_gratis_ve_8_semanas(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-16', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/weekly-adherence");

        $response->assertOk()->assertJsonCount(8);
    }

    public function test_usuario_pro_ve_8_semanas(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-16', 'UTC'));

        $user = User::factory()->create(['subscription_tier' => 'pro', 'subscription_expires_at' => now()->addMonth()]);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/weekly-adherence");

        $response->assertOk()->assertJsonCount(8);
    }

    public function test_semanas_vem_em_ordem_cronologica_da_mais_antiga_pra_mais_recente(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-16', 'UTC')); // domingo

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/weekly-adherence");

        $weeks = $response->json();
        // Índice da última semana calculado, não fixo: antes eram 4
        // semanas (free) e o `[3]` fixo resolvia; desde T1 (2026-09-25)
        // são 8 para todo mundo, e o fixo passaria a apontar para uma
        // semana intermediária em silêncio.
        $last = count($weeks) - 1;
        $this->assertSame('2026-08-16', $weeks[$last]['week_end']); // última = hoje
        $this->assertTrue($weeks[0]['week_end'] < $weeks[$last]['week_end']);
    }

    public function test_percentual_por_semana_reflete_doses_de_verdade(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-16', 'UTC')); // domingo

        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // Semana atual (hoje incluído) 100% tomada.
        foreach (range(0, 6) as $daysAgo) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => Carbon::today('UTC')->subDays($daysAgo)->setTimeFromTimeString('08:00:00'),
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/weekly-adherence");

        $weeks = $response->json();
        $last = count($weeks) - 1; // ver comentário em test_semanas_vem_em_ordem_...
        $this->assertSame(100, $weeks[$last]['percentage']); // semana mais recente
        $this->assertSame(0, $weeks[0]['percentage']); // semanas sem log nenhum
    }

    public function test_retorna_403_para_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($intruder)->getJson("/api/profiles/{$profile->id}/weekly-adherence");

        $response->assertForbidden();
    }
}
