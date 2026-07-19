<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_lista_apenas_perfis_do_usuario_autenticado(): void
    {
        $user = User::factory()->create();
        Profile::factory()->count(2)->create(['user_id' => $user->id]);
        Profile::factory()->create(); // de outro usuário

        $response = $this->actingAs($user)->getJson('/api/profiles');

        $response->assertOk()->assertJsonCount(2);
    }

    public function test_cria_perfil(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/profiles', [
            'name' => 'Vovó',
            'color' => '#ff0000',
            'avatar_emoji' => '👵',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('profiles', ['user_id' => $user->id, 'name' => 'Vovó']);
    }

    public function test_bloqueia_criacao_de_quinto_perfil_no_plano_gratuito(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        Profile::factory()->count(4)->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson('/api/profiles', ['name' => 'Quinto']);

        $response->assertForbidden();
        $this->assertSame(4, Profile::where('user_id', $user->id)->count());
    }

    public function test_usuario_pro_pode_criar_mais_de_quatro_perfis(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addMonth(),
        ]);
        Profile::factory()->count(4)->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson('/api/profiles', ['name' => 'Quinto']);

        $response->assertCreated();
    }

    public function test_nao_permite_ver_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($intruder)->getJson("/api/profiles/{$profile->id}")->assertForbidden();
    }

    public function test_nao_permite_atualizar_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($intruder)
            ->putJson("/api/profiles/{$profile->id}", ['name' => 'Hackeado'])
            ->assertForbidden();

        $this->assertDatabaseMissing('profiles', ['id' => $profile->id, 'name' => 'Hackeado']);
    }

    public function test_nao_permite_deletar_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($intruder)->deleteJson("/api/profiles/{$profile->id}")->assertForbidden();
        $this->assertDatabaseHas('profiles', ['id' => $profile->id]);
    }

    public function test_deleta_o_proprio_perfil(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)->deleteJson("/api/profiles/{$profile->id}")->assertNoContent();
        $this->assertDatabaseMissing('profiles', ['id' => $profile->id]);
    }
}
