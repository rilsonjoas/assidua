<?php

namespace Tests\Feature;

use App\Actions\SendWeeklyAdherenceSummary;
use App\Models\Medication;
use App\Models\Profile;
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
}
