<?php

namespace Tests\Feature;

use App\Models\PushToken;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PushTokenTest extends TestCase
{
    use RefreshDatabase;

    public function test_registra_token_novo(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/push-tokens', [
            'token' => 'ExponentPushToken[abc123]',
            'platform' => 'android',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('push_tokens', [
            'user_id' => $user->id,
            'token' => 'ExponentPushToken[abc123]',
            'platform' => 'android',
        ]);
    }

    public function test_reenviar_mesmo_token_atualiza_em_vez_de_duplicar(): void
    {
        $user = User::factory()->create();
        PushToken::factory()->create(['token' => 'ExponentPushToken[abc123]', 'user_id' => $user->id]);

        $this->actingAs($user)->postJson('/api/push-tokens', [
            'token' => 'ExponentPushToken[abc123]',
            'platform' => 'ios',
        ])->assertCreated();

        $this->assertSame(1, PushToken::count());
        $this->assertDatabaseHas('push_tokens', ['token' => 'ExponentPushToken[abc123]', 'platform' => 'ios']);
    }

    public function test_mesmo_token_muda_de_dono_se_outra_conta_registrar(): void
    {
        // Cenário real: device reinstala o app e loga com outra conta —
        // o token do Expo pode continuar o mesmo.
        $firstUser = User::factory()->create();
        $secondUser = User::factory()->create();
        PushToken::factory()->create(['token' => 'ExponentPushToken[shared]', 'user_id' => $firstUser->id]);

        $this->actingAs($secondUser)->postJson('/api/push-tokens', [
            'token' => 'ExponentPushToken[shared]',
        ])->assertCreated();

        $this->assertDatabaseHas('push_tokens', [
            'token' => 'ExponentPushToken[shared]',
            'user_id' => $secondUser->id,
        ]);
    }
}
