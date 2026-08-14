<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\PushToken;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// "Resumo semanal" (Fase 2, 2026-08-13) — o comando em si (janela de
// horário por fuso + dedupe). O cálculo de percentual já é testado à
// parte em CalculateWeeklyAdherenceTest.
class SendWeeklyAdherenceSummariesCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function setUpProfileWithSchedule(string $timezone): Profile
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => $timezone]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        PushToken::factory()->create(['user_id' => $user->id]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::now($timezone)->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        return $profile;
    }

    public function test_manda_pro_perfil_cujo_domingo_20h_local_e_agora(): void
    {
        Http::fake();
        // 20h UTC — é domingo 20h em UTC mesmo (fuso 0).
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:00:00', 'UTC'));

        $profile = $this->setUpProfileWithSchedule('UTC');

        $this->artisan('adherence:send-weekly-summary')->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertNotNull($profile->fresh()->last_weekly_summary_sent_at);
    }

    public function test_nao_manda_pro_perfil_cujo_domingo_20h_local_ainda_nao_chegou(): void
    {
        Http::fake();
        // 20h UTC = 17h em America/Sao_Paulo (UTC-3) — ainda não é 20h lá.
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:00:00', 'UTC'));

        $this->setUpProfileWithSchedule('America/Sao_Paulo');

        $this->artisan('adherence:send-weekly-summary')->assertSuccessful();

        Http::assertNothingSent();
    }

    public function test_dois_perfis_em_fusos_diferentes_recebem_em_horarios_diferentes(): void
    {
        Http::fake();
        // 23h UTC = 20h em America/Sao_Paulo (UTC-3).
        Carbon::setTestNow(Carbon::parse('2026-08-16 23:00:00', 'UTC'));

        $utcProfile = $this->setUpProfileWithSchedule('UTC'); // 23h local lá — não é a janela
        $spProfile = $this->setUpProfileWithSchedule('America/Sao_Paulo'); // 20h local lá — é a janela

        $this->artisan('adherence:send-weekly-summary')->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertNull($utcProfile->fresh()->last_weekly_summary_sent_at);
        $this->assertNotNull($spProfile->fresh()->last_weekly_summary_sent_at);
    }

    public function test_nao_manda_de_novo_na_mesma_semana_se_o_comando_rodar_outra_vez_na_janela(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:00:00', 'UTC'));

        $this->setUpProfileWithSchedule('UTC');

        $this->artisan('adherence:send-weekly-summary')->assertSuccessful();
        Http::assertSentCount(1);

        // Comando roda de novo minutos depois, ainda dentro da janela das 20h-20:59.
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:45:00', 'UTC'));
        $this->artisan('adherence:send-weekly-summary')->assertSuccessful();

        Http::assertSentCount(1); // continua 1, não duplicou
    }

    public function test_nao_manda_fora_de_domingo(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-17 20:00:00', 'UTC')); // segunda

        $this->setUpProfileWithSchedule('UTC');

        $this->artisan('adherence:send-weekly-summary')->assertSuccessful();

        Http::assertNothingSent();
    }
}
