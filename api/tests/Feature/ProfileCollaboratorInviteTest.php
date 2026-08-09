<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Fase 1.5, Etapa 2 — fluxo de convite/resgate de verdade (endpoints).
class ProfileCollaboratorInviteTest extends TestCase
{
    use RefreshDatabase;

    public function test_dono_cria_convite_e_recebe_codigo(): void
    {
        $owner = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($owner)->postJson("/api/profiles/{$profile->id}/collaborators");

        $response->assertCreated();
        $response->assertJsonStructure(['id', 'invite_code', 'expires_at']);
        $this->assertNotNull($response->json('invite_code'));
        $this->assertDatabaseHas('profile_collaborators', [
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
        ]);
    }

    public function test_apenas_dono_pode_criar_convite(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->postJson("/api/profiles/{$profile->id}/collaborators");

        $response->assertForbidden();
        $this->assertSame(0, ProfileCollaborator::count());
    }

    public function test_outro_usuario_resgata_o_codigo_e_vira_colaborador(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $invite = ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'ABC12345',
            'expires_at' => now()->addDays(7),
        ]);

        $response = $this->actingAs($caregiver)->postJson('/api/invites/ABC12345/accept');

        $response->assertOk();
        $response->assertJsonFragment(['id' => $profile->id]);

        $invite->refresh();
        $this->assertSame($caregiver->id, $invite->user_id);
        $this->assertNull($invite->invite_code);
        $this->assertNotNull($invite->accepted_at);
        $this->assertContains($profile->id, $caregiver->fresh()->sharedProfiles->pluck('id'));
    }

    public function test_rejeita_codigo_inexistente(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/invites/NAOEXIST/accept');

        $response->assertNotFound();
    }

    public function test_rejeita_codigo_ja_resgatado(): void
    {
        $owner = User::factory()->create();
        $firstCaregiver = User::factory()->create();
        $secondCaregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'ONCE0001',
            'expires_at' => now()->addDays(7),
        ]);

        $this->actingAs($firstCaregiver)->postJson('/api/invites/ONCE0001/accept')->assertOk();
        $response = $this->actingAs($secondCaregiver)->postJson('/api/invites/ONCE0001/accept');

        $response->assertNotFound();
    }

    public function test_rejeita_codigo_expirado(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'EXPIRED1',
            'expires_at' => Carbon::now()->subDay(),
        ]);

        $response = $this->actingAs($caregiver)->postJson('/api/invites/EXPIRED1/accept');

        $response->assertStatus(410);
    }

    public function test_dono_nao_pode_resgatar_convite_do_proprio_perfil(): void
    {
        $owner = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'OWNSELF1',
            'expires_at' => now()->addDays(7),
        ]);

        $response = $this->actingAs($owner)->postJson('/api/invites/OWNSELF1/accept');

        $response->assertStatus(422);
    }

    public function test_rejeita_resgate_se_ja_e_colaborador_aceito(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'SECOND01',
            'expires_at' => now()->addDays(7),
        ]);

        $response = $this->actingAs($caregiver)->postJson('/api/invites/SECOND01/accept');

        $response->assertStatus(422);
    }

    public function test_dono_lista_colaboradores_do_perfil(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);

        $response = $this->actingAs($owner)->getJson("/api/profiles/{$profile->id}/collaborators");

        $response->assertOk()->assertJsonCount(1);
    }

    public function test_dono_revoga_acesso_de_colaborador(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $collaborator = ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);

        $response = $this->actingAs($owner)->deleteJson("/api/profiles/{$profile->id}/collaborators/{$collaborator->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('profile_collaborators', ['id' => $collaborator->id]);
    }

    public function test_intruso_nao_revoga_colaborador_de_perfil_alheio(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $collaborator = ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);

        $response = $this->actingAs($intruder)->deleteJson("/api/profiles/{$profile->id}/collaborators/{$collaborator->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('profile_collaborators', ['id' => $collaborator->id]);
    }
}
