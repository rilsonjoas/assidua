<?php

namespace Tests\Feature;

use App\Models\DoseSchedule;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Limiar de estoque: coluna morta e o caso da PRN (2026-09-28).
 *
 * Dois achados de auditoria, ambos sobre "quando avisar que o remédio
 * está acabando". Nenhum é bug de cálculo — é decisão de produto que
 * nunca foi escrita, e o teste serve para deixar a decisão visível.
 *
 * 1. `stock_items.min_alert_quantity` existe desde a migration original
 *    (2026-06-28) com default 5, e `StockItem::isLow()` compara a
 *    quantidade contra ela. **`isLow()` não é chamado em lugar nenhum**, e
 *    o app usa outro critério: `LOW_STOCK_DAYS_THRESHOLD = 7`, em DIAS
 *    (`services/medications.ts:55`). Ou seja, a coluna é lida por método
 *    morto e nunca escrita — o app não tem rota para mudá-la.
 *
 *    Isso é uma pendência, não um bug: o critério em dias é o melhor para
 *    este público ("dá para 7 dias" é o que a pessoa decide). Mas a
 *    coluna existindo com default e sem dono é dívida.
 *
 * 2. `daysRemaining` divide por `dosesPerDay()`, que vem dos SCHEDULES. A
 *    dose de resgate (PRN) não tem schedule por definição — é a
 *    diferença estrutural entre ela e a agendada. Logo
 *    `days_remaining` é sempre `null` numa PRN, e o app trata
 *    `null` como "não avisar" (`daysRemaining !== null && days <= 7`).
 *    Resultado: um resgate com o estoque zerado não mostra "acaba em N
 *    dias" em nenhuma aba, e a pessoa não tem como saber.
 *
 *    O app tem PRN desde 2026-09-25 (commit 3dff0b6). Este teste fixa o
 *    comportamento para que a decisão de produto — se PRN deve ter
 *    alerta de estoque — seja consciente.
 */
class StockAlertThresholdTest extends TestCase
{
    use RefreshDatabase;

    private function comSchedule(Medication $medication): DoseSchedule
    {
        return DoseSchedule::factory()->create([
            'medication_id' => $medication->id,
            'time' => '08:00',
            'days_of_week' => null,
            'is_active' => true,
        ]);
    }

    public function test_dose_agendada_tem_dias_remaining_e_o_app_avisa(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->comSchedule($medication);
        StockItem::create([
            'medication_id' => $medication->id,
            'current_quantity' => 3,
            'unit' => 'comprimidos',
            'min_alert_quantity' => 5,
            'last_updated_at' => '2026-09-01 10:00:00',
        ]);

        $medication->refresh()->load('schedules', 'stock');

        // 3 doses para 1/dia = 3 dias, abaixo do limiar de 7 do app.
        $this->assertSame(3, $medication->days_remaining);
        $this->assertLessThanOrEqual(7, $medication->days_remaining);
    }

    public function test_prn_tem_days_remaining_nulo_porque_nao_tem_schedule(): void
    {
        // A pendência de produto. `dosesPerDay()` é 0 sem schedule, e o
        // model devolve `null` nesse caso (não divide por zero).
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
        ]);
        StockItem::create([
            'medication_id' => $medication->id,
            'current_quantity' => 0,
            'unit' => 'gotas',
            'min_alert_quantity' => 5,
            'last_updated_at' => '2026-09-01 10:00:00',
        ]);

        $medication->refresh()->load('schedules', 'stock');

        $this->assertNull($medication->days_remaining);
        // E o app trata null como "não avisar", então o estoque zerado de
        // uma PRN é invisível nas duas abas. Documentado, não corrigido:
        // a solução (avisar por quantidade para PRN?) é decisão do
        // Rilson, e depende de quanto "zerado" ainda é plausível numa PRN
        // — o frasco de resgate costuma ser o último a acabar.
    }

    public function test_min_alert_quantity_e_aceita_pela_api_mas_o_app_nao_a_envia(): void
    {
        // Registra o estado real da dívida, sem afirmar que é o
        // comportamento desejado.
        //
        // Escrevi este teste ACHANDO que a coluna não podia ser alterada
        // pela API, e o teste mostrou o contrário: `min_alert_quantity`
        // está no `validate` do `StockController` como `sometimes`, e
        // grava 20 sem reclamar. A coluna é alcançável pelo backend o
        // tempo todo — o que não existe é o CAMINHO no app: nenhuma tela
        // tem campo para ela, e nenhum `updateStock` envia.
        //
        // A diferença importa: se a decisão for "a pessoa escolhe o
        // limite", é UI. Se for "a coluna sai", é migration. Antes eu
        // achava que era a segunda.
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->comSchedule($medication);

        $stock = StockItem::create([
            'medication_id' => $medication->id,
            'current_quantity' => 30,
            'unit' => 'comprimidos',
            'last_updated_at' => '2026-09-01 10:00:00',
        ]);

        // Default da migration, nunca alterado pelo app.
        $this->assertEquals(5, $stock->fresh()->min_alert_quantity);

        // `isLow()` existe e funciona (3 <= 5), mas o app não o chama:
        // o critério real é em DIAS, não em quantidade.
        $stock->update(['current_quantity' => 3]);
        $this->assertTrue($stock->fresh()->isLow());

        // A API aceita a escrita...
        $this->actingAs($user)->putJson("/api/medications/{$medication->id}/stock", [
            'current_quantity' => 30,
            'min_alert_quantity' => 20,
        ])->assertOk();
        $this->assertEquals(20, $stock->fresh()->min_alert_quantity);
    }
}
