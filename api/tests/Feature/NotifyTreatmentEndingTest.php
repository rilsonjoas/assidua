<?php

namespace Tests\Feature;

use App\Actions\NotifyTreatmentEnding;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// "Duração do tratamento" (2026-08-14) — decisão de produto confirmada
// com o Rilson: quando os dias acabarem, só avisar, nunca pausar sozinho.
class NotifyTreatmentEndingTest extends TestCase
{
    use RefreshDatabase;

    public function test_manda_push_avisando_que_o_tratamento_termina_hoje(): void
    {
        Http::fake();

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'name' => 'Vovó']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Amoxicilina']);
        PushToken::factory()->create(['user_id' => $user->id, 'token' => 'ExponentPushToken[abc]']);

        $sent = app(NotifyTreatmentEnding::class)->handle($medication);

        $this->assertTrue($sent);
        Http::assertSent(function ($request) {
            return $request->url() === 'https://exp.host/--/api/v2/push/send'
                && $request['to'] === 'ExponentPushToken[abc]'
                && str_contains($request['body'], 'Amoxicilina')
                && str_contains($request['body'], 'Vovó');
        });
    }

    public function test_nao_manda_quando_dono_nao_tem_push_token(): void
    {
        Http::fake();

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $sent = app(NotifyTreatmentEnding::class)->handle($medication);

        $this->assertFalse($sent);
        Http::assertNothingSent();
    }
}
