<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Unidade do estoque (2026-09-28).
 *
 * Este arquivo documenta um bug que a API tinha e que só apareceu quando
 * alguém comparou as telas do app: `MedicationController::store()` criava
 * a linha de estoque com `'unit' => $data['unit']` — a unidade da
 * **DOSAGEM**. Cadastrar "Losartana 50 mg" guardava `stock_items.unit =
 * 'mg'`, e o app mostrava "30 mg em estoque" ao lado de "acaba em 30
 * dias" — que não bate com a conta, porque 30 comprimidos a 50 mg não
 * são 30 mg.
 *
 * Para o público do app, "0" e "mg" ao lado de um número significam "estou
 * sem remédio".
 *
 * A correção no app (2026-09-28, decisão do Rilson) foi a unidade do
 * estoque virar um campo PRÓPRIO, escolhido na aba Estoque — a
 * `StockController::update()` já aceitava `'unit'`, o app é que nunca
 * mandava. Estes testes travam o contrato dos dois lados.
 *
 * NÃO há teste de migration aqui: a correção do dado já gravado depende
 * de quantas linhas estão afetadas, e o SQL de diagnóstico está em
 * `docs/interface-2026-09-28.md` §6.
 */
class MedicationStockUnitTest extends TestCase
{
    use RefreshDatabase;

    private function profileFor(User $user): Profile
    {
        return Profile::factory()->create(['user_id' => $user->id]);
    }

    public function test_criar_com_dose_em_mg_NAO_herda_mg_para_o_estoque(): void
    {
        $user = User::factory()->create();
        $profile = $this->profileFor($user);

        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
        ])->assertCreated();

        $medication = Medication::where('name', 'Losartana')->firstOrFail();

        // A dose é mg...
        $this->assertSame('mg', $medication->unit);

        // ...e o estoque NÃO pode ser. A unidade do estoque é campo
        // próprio, definido pela pessoa na aba Estoque. Sem esse assert
        // o bug volta em silêncio: ele já esteve aqui e ninguém notou
        // porque a tela escondia a incoerência atrás de "acaba em N dias".
        $this->assertNotSame('mg', $medication->stock->unit);
    }

    public function test_estoque_usa_unidade_padrao_quando_a_dose_tem_unidade(): void
    {
        $user = User::factory()->create();
        $profile = $this->profileFor($user);

        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Dipirona',
            'dosage' => '500',
            'unit' => 'mg',
        ])->assertCreated();

        $medication = Medication::where('name', 'Dipirona')->firstOrFail();

        // O default tem que ser uma unidade de CONTAGEM, não a de dose:
        // "comprimidos" é o que a pessoa conta numa caixa.
        $this->assertNotSame('mg', $medication->stock->unit);
    }

    public function test_atualizar_estoque_aceita_e_grava_a_unidade_escolhida(): void
    {
        $user = User::factory()->create();
        $profile = $this->profileFor($user);
        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
        ])->assertCreated();

        $medication = Medication::where('name', 'Losartana')->firstOrFail();

        // O app envia `unit` junto de `current_quantity` desde 2026-09-28.
        // A validação já aceitava o campo (`StockController.php:30`); o
        // que faltava era o app mandar.
        $this->actingAs($user)
            ->putJson("/api/medications/{$medication->id}/stock", [
                'current_quantity' => 30,
                'unit' => 'comprimidos',
            ])
            ->assertOk();

        $medication->refresh()->load('stock');
        // `assertEquals` e não `assertSame`: `current_quantity` é
        // `decimal(8,2)`, então volta do banco como string e o cast
        // produz float. `assertSame(30, 30.0)` falha por TIPO, não por
        // valor — foi o que aconteceu na primeira rodada.
        $this->assertEquals(30, $medication->stock->current_quantity);
        $this->assertSame('comprimidos', $medication->stock->unit);
    }

    public function test_unidade_do_estoque_aceita_ml_para_liquido(): void
    {
        // O caso que matou a solução "sempre mostrar doses": xarope. 10 ml
        // de dose, 200 ml no frasco — "200 doses" seria mentira. A
        // unidade do estoque tem que aceitar ml, e o app tem que conseguir
        // ENVIAR ml.
        $user = User::factory()->create();
        $profile = $this->profileFor($user);
        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Paracetamol',
            'dosage' => '10',
            'unit' => 'ml',
        ])->assertCreated();

        $medication = Medication::where('name', 'Paracetamol')->firstOrFail();

        $this->actingAs($user)
            ->putJson("/api/medications/{$medication->id}/stock", [
                'current_quantity' => 200,
                'unit' => 'ml',
            ])
            ->assertOk();

        $medication->refresh()->load('stock');
        $this->assertSame('ml', $medication->stock->unit);
    }

    public function test_unidade_do_estoque_aceita_gotas(): void
    {
        $user = User::factory()->create();
        $profile = $this->profileFor($user);
        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Latanoprosta',
            'dosage' => '1',
        ])->assertCreated();

        $medication = Medication::where('name', 'Latanoprosta')->firstOrFail();

        $this->actingAs($user)
            ->putJson("/api/medications/{$medication->id}/stock", [
                'current_quantity' => 15,
                'unit' => 'gotas',
            ])
            ->assertOk();

        $medication->refresh()->load('stock');
        $this->assertSame('gotas', $medication->stock->unit);
    }

    public function test_dias_remaining_ignora_a_unidade_e_conta_doses_por_dia(): void
    {
        // A conta NUNCA esteve errada: `Medication::daysRemaining()` faz
        // `floor(current_quantity / dosesPerDay)` — divide por doses por
        // dia, nunca pela dosagem nem pela unidade. Este teste existe
        // porque a tentação, ao mexer na unidade, é "corrigir" a conta
        // também — e aí sim viraria erro. Este é o valor certo.
        $user = User::factory()->create();
        $profile = $this->profileFor($user);
        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
        ])->assertCreated();

        $medication = Medication::where('name', 'Losartana')->firstOrFail();
        $medication->stock()->update(['current_quantity' => 30, 'unit' => 'comprimidos']);
        $medication->schedules()->create([
            'time' => '08:00',
            'days_of_week' => null,
        ]);

        $medication->refresh()->load('schedules', 'stock');
        $this->assertSame(30, $medication->days_remaining);
    }
}
