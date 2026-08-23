<?php

namespace Tests\Feature;

use App\Actions\SendWeeklyAdherenceSummary;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\PushToken;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SendWeeklyAdherenceSummaryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_manda_push_com_percentual_calculado(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        PushToken::factory()->create(['user_id' => $user->id, 'token' => 'ExponentPushToken[abc]']);

        $today = Carbon::today('UTC');
        foreach (range(0, 6) as $daysAgo) {
            \App\Models\DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $today->copy()->subDays($daysAgo)->setTimeFromTimeString('08:00:00'),
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        $sent = app(SendWeeklyAdherenceSummary::class)->handle($profile);

        $this->assertTrue($sent);
        Http::assertSent(function ($request) {
            return $request->url() === 'https://exp.host/--/api/v2/push/send'
                && $request['to'] === 'ExponentPushToken[abc]'
                && str_contains($request['body'], '100%');
        });
    }

    public function test_nao_manda_quando_perfil_nao_tem_schedule_previsto_na_semana(): void
    {
        Http::fake();

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        PushToken::factory()->create(['user_id' => $user->id]);

        $sent = app(SendWeeklyAdherenceSummary::class)->handle($profile);

        $this->assertFalse($sent);
        Http::assertNothingSent();
    }

    public function test_nao_manda_quando_dono_nao_tem_push_token_registrado(): void
    {
        Http::fake();

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $sent = app(SendWeeklyAdherenceSummary::class)->handle($profile);

        $this->assertFalse($sent);
        Http::assertNothingSent();
    }

    // Ideia de produto (2026-08-22): cuidador remoto só ouvia do app
    // quando algo dava errado (alerta de dose perdida). Resumo semanal
    // agora também vai pra ele, com mensagem de afirmação — não o
    // mesmo relatório que o dono recebe.
    public function test_cuidador_aceito_recebe_mensagem_de_afirmacao_diferente_do_dono(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:00:00', 'UTC'));

        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'name' => 'Dona Maria', 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        PushToken::factory()->create(['user_id' => $owner->id, 'token' => 'ExponentPushToken[owner]']);
        PushToken::factory()->create(['user_id' => $caregiver->id, 'token' => 'ExponentPushToken[caregiver]']);
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'user_id' => $caregiver->id,
            'accepted_at' => now(),
        ]);

        $today = Carbon::today('UTC');
        foreach (range(0, 6) as $daysAgo) {
            \App\Models\DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $today->copy()->subDays($daysAgo)->setTimeFromTimeString('08:00:00'),
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        $sent = app(SendWeeklyAdherenceSummary::class)->handle($profile);

        $this->assertTrue($sent);
        Http::assertSent(fn ($r) => $r['to'] === 'ExponentPushToken[owner]' && str_contains($r['body'], '100%'));
        Http::assertSent(fn ($r) => $r['to'] === 'ExponentPushToken[caregiver]'
            && str_contains($r['body'], 'Dona Maria')
            && str_contains($r['body'], 'diferença')
            && ! str_contains($r['body'], '%'));
    }

    public function test_colaborador_pendente_nao_recebe_resumo(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-16 20:00:00', 'UTC'));

        $owner = User::factory()->create();
        $invited = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        PushToken::factory()->create(['user_id' => $invited->id, 'token' => 'ExponentPushToken[pending]']);
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'user_id' => $invited->id,
            'accepted_at' => null,
        ]);

        $today = Carbon::today('UTC');
        \App\Models\DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $today->copy()->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        app(SendWeeklyAdherenceSummary::class)->handle($profile);

        Http::assertNotSent(fn ($r) => $r['to'] === 'ExponentPushToken[pending]');
    }
}
