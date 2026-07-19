<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-07-15 12:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function createLog(Profile $profile, Medication $medication, array $overrides = []): DoseLog
    {
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        return DoseLog::create(array_merge([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now(),
            'status' => 'taken',
        ], $overrides));
    }

    public function test_lista_historico_do_perfil(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_filtra_por_status(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['status' => 'taken']);
        $this->createLog($profile, $medication, ['status' => 'skipped']);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history?status=skipped");

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('skipped', $response->json('data.0.status'));
    }

    public function test_filtra_por_medicamento(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medicationA = Medication::factory()->create(['profile_id' => $profile->id]);
        $medicationB = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medicationA);
        $this->createLog($profile, $medicationB);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history?medication_id={$medicationA->id}");

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($medicationA->id, $response->json('data.0.medication_id'));
    }

    public function test_filtra_por_intervalo_de_datas(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => Carbon::parse('2026-07-10 08:00:00')]);
        $this->createLog($profile, $medication, ['scheduled_at' => Carbon::parse('2026-07-14 08:00:00')]);

        $response = $this->actingAs($user)->getJson(
            "/api/profiles/{$profile->id}/doses/history?date_from=2026-07-13&date_to=2026-07-15"
        );

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_usuario_free_nao_ve_historico_com_mais_de_30_dias(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(5)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(45)]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_usuario_pro_ve_historico_alem_de_30_dias(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addMonth(),
        ]);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(5)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(45)]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_nao_permite_ver_historico_de_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($intruder)
            ->getJson("/api/profiles/{$profile->id}/doses/history")
            ->assertForbidden();
    }
}
