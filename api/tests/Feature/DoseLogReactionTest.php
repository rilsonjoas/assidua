<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DoseLogReactionTest extends TestCase
{
    use RefreshDatabase;

    private function makeDoseLog(User $owner): DoseLog
    {
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        return DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now(),
            'taken_at' => now(),
            'status' => 'taken',
        ]);
    }

    public function test_colaborador_aceito_reage_e_dono_e_notificado(): void
    {
        Http::fake();

        $owner = User::factory()->create();
        $caregiver = User::factory()->create(['name' => 'Ana']);
        $doseLog = $this->makeDoseLog($owner);
        ProfileCollaborator::factory()->create([
            'profile_id' => $doseLog->profile_id,
            'user_id' => $caregiver->id,
            'accepted_at' => now(),
        ]);
        PushToken::factory()->create(['user_id' => $owner->id, 'token' => 'ExponentPushToken[owner]']);

        Sanctum::actingAs($caregiver);
        $response = $this->postJson("/api/dose-logs/{$doseLog->id}/react");

        $response->assertOk();
        $this->assertNotNull($doseLog->fresh()->reacted_at);
        $this->assertSame($caregiver->id, $doseLog->fresh()->reacted_by_user_id);
        Http::assertSent(fn ($r) => $r['to'] === 'ExponentPushToken[owner]' && str_contains($r['body'], 'Ana'));
    }

    public function test_reagir_a_propria_dose_nao_dispara_notificacao(): void
    {
        Http::fake();

        $owner = User::factory()->create();
        $doseLog = $this->makeDoseLog($owner);
        PushToken::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($owner);
        $this->postJson("/api/dose-logs/{$doseLog->id}/react")->assertOk();

        $this->assertNotNull($doseLog->fresh()->reacted_at);
        Http::assertNothingSent();
    }

    public function test_usuario_sem_acesso_ao_perfil_nao_pode_reagir(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $doseLog = $this->makeDoseLog($owner);

        Sanctum::actingAs($stranger);
        $this->postJson("/api/dose-logs/{$doseLog->id}/react")->assertForbidden();

        $this->assertNull($doseLog->fresh()->reacted_at);
    }

    public function test_colaborador_pendente_nao_pode_reagir(): void
    {
        $owner = User::factory()->create();
        $invited = User::factory()->create();
        $doseLog = $this->makeDoseLog($owner);
        ProfileCollaborator::factory()->create([
            'profile_id' => $doseLog->profile_id,
            'user_id' => $invited->id,
            'accepted_at' => null,
        ]);

        Sanctum::actingAs($invited);
        $this->postJson("/api/dose-logs/{$doseLog->id}/react")->assertForbidden();
    }
}
