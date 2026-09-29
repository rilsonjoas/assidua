<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Unidade do estoque deixou de herdar a unidade da dose (2026-09-28).
 *
 * `MedicationController::store()` criava a linha de estoque com
 * `'unit' => $data['unit']` — a unidade da DOSAGEM, o que a pessoa digitou
 * no campo "Dose" (mg, ml, gotas). Então "Losartana 50 mg" com 30
 * comprimidos na caixa ficava com `stock_items.unit = 'mg'`, e o app
 * mostrava "30 mg em estoque" ao lado de "acaba em 30 dias" — que não
 * bate com a conta, porque 30 comprimidos a 50 mg não são 30 mg.
 *
 * Para o público deste app, "0" e "mg" ao lado de um número significam
 * "estou sem remédio": a pessoa corre na farmácia ou desiste de tomar o
 * que tem em casa.
 *
 * A conta NUNCA esteve errada: `Medication::daysRemaining()` faz
 * `floor(current_quantity / dosesPerDay)`, que divide por doses por dia,
 * nunca pela dosagem. O defeito era o texto ao lado do número e a origem
 * do dado — esta migration trata a origem.
 *
 * A correção no app (decisão do Rilson) foi a unidade do estoque virar um
 * campo PRÓPRIO, escolhido em chips na aba Estoque, com
 * `MedicationController::DEFAULT_STOCK_UNIT` no cadastro.
 *
 * ## O que ela NÃO faz, de propósito
 *
 * Trocar 'mg' por 'comprimidos' seria INVENTAR DADO: nem toda linha com
 * unidade de dose foi criada pelo bug — alguém pode ter corrigido na mão,
 * ou o remédio é líquido e 'ml' é a unidade certa.
 *
 * Só é seguro desfazer a cópia quando a unidade do estoque é a mesma da
 * dose **E** essa unidade é de MASSA, não de CONTAGEM. O motivo: para
 * comprimido, a unidade do estoque não pode ser 'mg' (ninguém conta
 * comprimidos em miligramas), então 'mg' no estoque só pode ter vindo do
 * `create()`. Para LÍQUIDO o raciocínio é o oposto: dose e estoque são
 * medidos na mesma unidade, 'ml'/'ml' é a escolha CORRETA, e trocar por
 * 'comprimidos' seria inventar dado.
 *
 * É por isso que a lista abaixo é explícita em vez de curinga: ela
 * contém só as unidades de medida que não contam unidades físicas. A
 * primeira versão desta migration usava só `si.unit = m.unit` e convertia
 * xarope — o teste `test_NAO_mexe_em_unidade_que_difere_da_dose` (e o de
 * correlação) pegaram, e é exatamente o caso que o filtro de contagem
 * resolve.
 *
 * Linhas fora dessa lista são deixadas como estão.
 */
return new class extends Migration
{
    /**
     * Unidades de DOSE que nunca são unidade de CONTAGEM — logo, quando
     * aparecem no estoque, vieram da herança do bug.
     *
     * 'gotas' NÃO entra: é unidade de contagem E aparece legitimately no
     * estoque de um colírio. 'ml' NÃO entra: para xarope, dose e estoque
     * usam a mesma unidade, e 'ml' no estoque é certo.
     */
    private const UNIDADES_DE_MASSA = ['mg', 'g', 'mcg', 'ug', 'µg', 'kg', 'ui', 'iu', 'mcg/ml'];

    public function up(): void
    {
        // Três condições, todas necessárias:
        //   1. subquery correlacionada — cada linha comparada com a dose
        //      do SEU remédio, não com o conjunto de todas as doses
        //   2. unidade igual à da dose
        //   3. unidade de masa (a lista acima) — o filtro que impede o
        //      xarope de virar 'comprimidos'
        $afetadas = DB::table('stock_items as si')
            ->join('medications as m', 'm.id', '=', 'si.medication_id')
            ->whereColumn('si.unit', 'm.unit')
            ->whereNotNull('si.unit')
            ->whereIn('si.unit', self::UNIDADES_DE_MASSA)
            ->update(['si.unit' => 'comprimidos']);

        if ($afetadas > 0) {
            logger()->info('stock: unidade herdada da dose convertida para comprimidos', [
                'linhas' => $afetadas,
            ]);
        }
    }

    public function down(): void
    {
        // Irreversível, de propósito.
        //
        // Reverter exigiria saber, para cada linha, qual era a unidade da
        // dose antes da conversão — informação que não sobrevive depois
        // que a linha foi reescrita. A alternativa seria gravar a unidade
        // antiga numa coluna de backup, o que é mais schema para corrigir
        // um texto errado.
        //
        // Se for preciso reverter, o caminho seguro é gerar a migration
        // nova a partir do resultado de uma consulta de diagnóstico, com
        // a unidade alvo explícita por remédio — não este `down`.
    }
};
