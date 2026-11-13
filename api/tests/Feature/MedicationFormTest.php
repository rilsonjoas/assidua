<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Forma farmacêutica e conteúdo da embalagem (2026-11-13) — caso do
 * Vick Vaporub: "12 g" é o pote, não a dose.
 */
class MedicationFormTest extends TestCase
{
    use RefreshDatabase;

    private function criar(array $extra, ?User $user = null): array
    {
        $user ??= User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $resp = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", array_merge(['name' => 'Teste'], $extra));

        return [$user, $resp];
    }

    public function test_topico_grava_forma_e_conteudo_e_conta_em_unidades(): void
    {
        [, $resp] = $this->criar([
            'name' => 'Vick Vaporub',
            'form' => 'topico',
            'package_content' => '12 g',
            'instructions' => 'camada fina no peito',
        ]);
        $resp->assertCreated();

        $med = Medication::where('name', 'Vick Vaporub')->with('stock')->first();
        $this->assertSame('topico', $med->form);
        $this->assertSame('12 g', $med->package_content);
        $this->assertSame('unidades', $med->stock->unit);
    }

    public function test_comprimido_e_liquido_tem_unidade_de_contagem_propria(): void
    {
        $this->criar(['name' => 'A', 'form' => 'comprimido']);
        $this->criar(['name' => 'B', 'form' => 'liquido']);

        $this->assertSame('comprimidos', Medication::where('name', 'A')->first()->stock->unit);
        $this->assertSame('frascos', Medication::where('name', 'B')->first()->stock->unit);
    }

    public function test_forma_invalida_e_recusada(): void
    {
        [, $resp] = $this->criar(['form' => 'pozinho-magico']);
        $resp->assertUnprocessable();
    }

    public function test_sem_forma_continua_como_antes(): void
    {
        [, $resp] = $this->criar(['name' => 'Antigo']);
        $resp->assertCreated();

        $med = Medication::where('name', 'Antigo')->first();
        $this->assertNull($med->form);
        $this->assertSame('unidades', $med->stock->unit);
    }

    public function test_forma_pode_ser_editada_e_limpa(): void
    {
        [$user] = $this->criar(['name' => 'Editavel']);
        $med = Medication::where('name', 'Editavel')->first();

        $this->actingAs($user)->putJson("/api/medications/{$med->id}", ['form' => 'gotas'])->assertOk();
        $this->assertSame('gotas', $med->refresh()->form);

        $this->actingAs($user)->putJson("/api/medications/{$med->id}", ['form' => null])->assertOk();
        $this->assertNull($med->refresh()->form);
    }
}
