<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationSummaryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_calcula_percentual_e_lista_doses_perdidas_no_periodo(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // 3 dias devidos: 2 tomados, 1 sem log (conta como perdida)
        foreach ([2, 1] as $daysAgo) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => Carbon::today('UTC')->subDays($daysAgo)->setTimeFromTimeString('08:00:00'),
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=3");

        $response->assertOk();
        $response->assertJsonPath('due', 3);
        $response->assertJsonPath('taken', 2);
        $response->assertJsonPath('percentage', 67);
        $response->assertJsonCount(1, 'missed');
        $response->assertJsonPath('missed.0.medication_name', 'Losartana');
    }

    public function test_dose_pulada_de_proposito_nao_conta_como_perdida(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today('UTC')->setTimeFromTimeString('08:00:00'),
            'status' => 'skipped',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=1");

        $response->assertOk();
        $response->assertJsonCount(0, 'missed');
    }

    public function test_usuario_gratis_nao_passa_de_30_dias(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=90");

        $response->assertOk();
        $response->assertJsonPath('period_days', 30);
    }

    public function test_usuario_sem_acesso_ao_perfil_recebe_403(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($stranger);
        $this->getJson("/api/profiles/{$profile->id}/consultation-summary")->assertForbidden();
    }
}
