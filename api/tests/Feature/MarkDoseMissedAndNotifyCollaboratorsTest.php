<?php

namespace Tests\Feature;

use App\Actions\MarkDoseMissedAndNotifyCollaborators;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\PushToken;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarkDoseMissedAndNotifyCollaboratorsTest extends TestCase
{
    use RefreshDatabase;

    public function test_cria_o_log_perdido_mesmo_sem_colaborador(): void
    {
        Http::fake();

        $owner = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = app(MarkDoseMissedAndNotifyCollaborators::class)
            ->handle($schedule, $medication, $profile, Carbon::parse('08:00:00'));

        $this->assertSame('missed', $log->status);
        Http::assertNothingSent();
    }

    public function test_notifica_todos_os_tokens_de_todos_os_colaboradores_aceitos(): void
    {
        Http::fake();

        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'name' => 'Vovó Maria']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);
        PushToken::factory()->create(['user_id' => $caregiver->id, 'token' => 'ExponentPushToken[t1]']);
        PushToken::factory()->create(['user_id' => $caregiver->id, 'token' => 'ExponentPushToken[t2]']);

        app(MarkDoseMissedAndNotifyCollaborators::class)
            ->handle($schedule, $medication, $profile, Carbon::parse('08:00:00'));

        Http::assertSentCount(2);
        Http::assertSent(function ($request) {
            return $request->url() === 'https://exp.host/--/api/v2/push/send'
                && $request['to'] === 'ExponentPushToken[t1]'
                && str_contains($request['body'], 'Vovó Maria')
                && str_contains($request['body'], 'Losartana');
        });
    }

    public function test_nao_notifica_convite_pendente_nem_dono(): void
    {
        Http::fake();

        $owner = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        PushToken::factory()->create(['user_id' => $owner->id]); // dono tem token, não deveria receber push por isto
        ProfileCollaborator::factory()->create([ // convite pendente, ninguém aceitou ainda
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
        ]);

        app(MarkDoseMissedAndNotifyCollaborators::class)
            ->handle($schedule, $medication, $profile, Carbon::parse('08:00:00'));

        Http::assertNothingSent();
    }

    public function test_falha_de_push_nao_impede_o_log_de_ser_criado(): void
    {
        Http::fake(['*' => Http::response(['error' => 'boom'], 500)]);

        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);
        PushToken::factory()->create(['user_id' => $caregiver->id]);

        $log = app(MarkDoseMissedAndNotifyCollaborators::class)
            ->handle($schedule, $medication, $profile, Carbon::parse('08:00:00'));

        $this->assertSame('missed', $log->status);
        $this->assertDatabaseHas('dose_logs', ['id' => $log->id]);
    }
}
