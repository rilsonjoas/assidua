<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Fase 1.5, Etapa 1 — só o modelo de dados ainda (convite/resgate reais
// vêm na Etapa 2, autorização revisada na Etapa 3). Aqui confere que o
// schema e as relações fazem o que deveriam antes de construir endpoint
// em cima.
class ProfileCollaboratorModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_convite_pendente_nao_tem_usuario_ainda(): void
    {
        $owner = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $invite = ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
        ]);

        $this->assertNull($invite->user_id);
        $this->assertNotNull($invite->invite_code);
        $this->assertNull($invite->accepted_at);
    }

    public function test_colaborador_aceito_aparece_em_sharedProfiles_do_cuidador(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);

        $shared = $caregiver->fresh()->sharedProfiles;

        $this->assertCount(1, $shared);
        $this->assertSame($profile->id, $shared->first()->id);
    }

    public function test_convite_pendente_nao_aparece_em_sharedProfiles(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        // Convite existe mas ninguém resgatou ainda (user_id nulo) —
        // não deveria contar como colaboração de verdade.
        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
        ]);

        $this->assertCount(0, $caregiver->fresh()->sharedProfiles);
    }

    public function test_apagar_perfil_apaga_colaboracoes_em_cascata(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $collaborator = ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);

        $profile->delete();

        $this->assertDatabaseMissing('profile_collaborators', ['id' => $collaborator->id]);
    }

    public function test_apagar_conta_do_cuidador_apaga_colaboracao_mas_nao_o_perfil(): void
    {
        $owner = User::factory()->create();
        $caregiver = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $collaborator = ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $caregiver->id,
        ]);

        $caregiver->delete();

        $this->assertDatabaseMissing('profile_collaborators', ['id' => $collaborator->id]);
        $this->assertDatabaseHas('profiles', ['id' => $profile->id]);
    }

    public function test_codigo_de_convite_e_unico(): void
    {
        $owner = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'ABC12345',
        ]);

        $this->expectException(\Illuminate\Database\QueryException::class);

        ProfileCollaborator::factory()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'invite_code' => 'ABC12345',
        ]);
    }
}
