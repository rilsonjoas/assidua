<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MedicationTest extends TestCase
{
    use RefreshDatabase;

    public function test_cria_medicamento_com_estoque_automatico(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
        ]);

        $response->assertCreated();
        $medication = Medication::where('name', 'Losartana')->first();
        $this->assertNotNull($medication);
        $this->assertDatabaseHas('stock_items', ['medication_id' => $medication->id]);
    }

    public function test_estoque_usa_unidade_padrao_quando_nao_informada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
        ])->assertCreated();

        $medication = Medication::where('name', 'Losartana')->first();
        $this->assertSame('comprimidos', $medication->stock->unit);
    }

    public function test_bloqueia_decimo_sexto_medicamento_ativo_no_plano_gratuito(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->count(15)->create(['profile_id' => $profile->id, 'is_active' => true]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Décimo sexto remédio',
            'dosage' => '10',
        ]);

        $response->assertForbidden();
        $this->assertSame(15, Medication::where('profile_id', $profile->id)->count());
    }

    public function test_medicamento_inativo_nao_conta_para_o_limite(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->count(14)->create(['profile_id' => $profile->id, 'is_active' => true]);
        Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Novo remédio',
            'dosage' => '10',
        ]);

        $response->assertCreated();
    }

    public function test_usuario_pro_nao_tem_limite_de_medicamentos(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addMonth(),
        ]);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->count(15)->create(['profile_id' => $profile->id, 'is_active' => true]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Décimo sexto remédio',
            'dosage' => '10',
        ]);

        $response->assertCreated();
    }

    public function test_index_lista_apenas_medicamentos_ativos(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/medications");

        $response->assertOk()->assertJsonCount(1);
    }

    public function test_nao_permite_criar_medicamento_em_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Invasor',
            'dosage' => '10',
        ]);

        $response->assertForbidden();
    }

    public function test_nao_permite_editar_medicamento_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $this->actingAs($intruder)
            ->putJson("/api/medications/{$medication->id}", ['name' => 'Hackeado'])
            ->assertForbidden();
    }
}
