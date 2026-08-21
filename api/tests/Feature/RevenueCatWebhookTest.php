<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RevenueCatWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret-revenuecat';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.revenuecat.webhook_secret' => self::SECRET]);
    }

    private function postEvent(array $event): \Illuminate\Testing\TestResponse
    {
        return $this->postJson(
            '/api/webhooks/revenuecat',
            ['event' => $event],
            ['Authorization' => self::SECRET]
        );
    }

    public function test_recusa_sem_authorization_correto(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $response = $this->postJson(
            '/api/webhooks/revenuecat',
            ['event' => ['type' => 'INITIAL_PURCHASE', 'app_user_id' => (string) $user->id]],
            ['Authorization' => 'valor-errado']
        );

        $response->assertStatus(401);
        $this->assertSame('free', $user->fresh()->subscription_tier);
    }

    public function test_recusa_sem_secret_configurado(): void
    {
        config(['services.revenuecat.webhook_secret' => null]);
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $response = $this->postJson(
            '/api/webhooks/revenuecat',
            ['event' => ['type' => 'INITIAL_PURCHASE', 'app_user_id' => (string) $user->id]],
            ['Authorization' => '']
        );

        $response->assertStatus(401);
        $this->assertSame('free', $user->fresh()->subscription_tier);
    }

    public function test_initial_purchase_concede_pro_com_data_de_expiracao(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $expirationMs = now()->addMonth()->getTimestampMs();

        $response = $this->postEvent([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => (string) $user->id,
            'expiration_at_ms' => $expirationMs,
        ]);

        $response->assertOk()->assertJson(['status' => 'ok']);
        $user->refresh();
        $this->assertSame('pro', $user->subscription_tier);
        $this->assertEqualsWithDelta($expirationMs, $user->subscription_expires_at->getTimestampMs(), 1000);
        $this->assertTrue($user->isPro());
    }

    public function test_non_renewing_purchase_sem_expiracao_vira_pro_permanente(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);

        $response = $this->postEvent([
            'type' => 'NON_RENEWING_PURCHASE',
            'app_user_id' => (string) $user->id,
            // sem expiration_at_ms — compra avulsa tipo "Pro vitalício"
        ]);

        $response->assertOk();
        $user->refresh();
        $this->assertSame('pro', $user->subscription_tier);
        $this->assertNull($user->subscription_expires_at);
        $this->assertTrue($user->isPro());
    }

    public function test_renewal_atualiza_data_de_expiracao(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addDay(),
        ]);
        $newExpirationMs = now()->addMonths(2)->getTimestampMs();

        $this->postEvent([
            'type' => 'RENEWAL',
            'app_user_id' => (string) $user->id,
            'expiration_at_ms' => $newExpirationMs,
        ])->assertOk();

        $user->refresh();
        $this->assertSame('pro', $user->subscription_tier);
        $this->assertEqualsWithDelta($newExpirationMs, $user->subscription_expires_at->getTimestampMs(), 1000);
    }

    public function test_expiration_revoga_pro(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->subDay(),
        ]);

        $this->postEvent([
            'type' => 'EXPIRATION',
            'app_user_id' => (string) $user->id,
        ])->assertOk();

        $user->refresh();
        $this->assertSame('free', $user->subscription_tier);
        $this->assertNull($user->subscription_expires_at);
        $this->assertFalse($user->isPro());
    }

    public function test_cancellation_nao_revoga_pro_na_hora(): void
    {
        $expiresAt = now()->addWeek();
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => $expiresAt,
        ]);

        $this->postEvent([
            'type' => 'CANCELLATION',
            'app_user_id' => (string) $user->id,
        ])->assertOk();

        $user->refresh();
        $this->assertSame('pro', $user->subscription_tier);
        $this->assertTrue($user->isPro());
    }

    public function test_app_user_id_sem_usuario_correspondente_nao_quebra(): void
    {
        $response = $this->postEvent([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => '999999',
            'expiration_at_ms' => now()->addMonth()->getTimestampMs(),
        ]);

        $response->assertOk()->assertJson(['status' => 'ignored']);
    }

    public function test_app_user_id_nao_numerico_nao_quebra(): void
    {
        // Defensivo: se algum dia o app_user_id não vier como o id
        // numérico esperado (ex.: RevenueCat gera um alias automático
        // antes do login acontecer), ignora em vez de crashar com erro
        // de tipo no User::find().
        $response = $this->postEvent([
            'type' => 'INITIAL_PURCHASE',
            'app_user_id' => '$RCAnonymousID:abc123',
        ]);

        $response->assertOk()->assertJson(['status' => 'ignored']);
    }
}
