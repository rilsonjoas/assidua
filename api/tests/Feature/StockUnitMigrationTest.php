<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A migration 2026_09_28_000000_fix_stock_unit_inherited_from_dosage.
 *
 * Este arquivo existe porque a migration é CORRETA e perigosa ao mesmo
 * tempo: ela reescreve dado existente, e uma reescrita que acerta o
 * caso óbvio e estraga olicho é pior do que o bug original. Então os
 * testes aqui cobrem tanto o que ela DEVE mexer quanto o que ela NÃO
 * PODE mexer.
 *
 * Roda no sqlite em memória que o `phpunit.xml` configura, com
 * `RefreshDatabase` — ou seja, a migration é executada de verdade a cada
 * rodada, e um erro de sintaxe ou de query aparece aqui.
 *
 * ⚠️ O sqlite em memória é mais permissivo que o MySQL de produção em
 * alguns detalhes de SQL. `whereColumn` e `update` com join são
 * suportados nos dois, mas a migration precisa ser conferida no MySQL
 * antes do deploy (`php artisan migrate` no ambiente de produção, depois
 * de um backup). A verificação de dados é a consulta de diagnóstico em
 * `docs/interface-2026-09-28.md` §6.
 */
class StockUnitMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function criarCom(string $nome, string $doseUnit, ?string $stockUnit): int
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'name' => $nome,
            'dosage' => '50',
            'unit' => $doseUnit,
        ]);
        $medication->stock()->create(['unit' => $stockUnit ?? 'comprimidos']);
        return $medication->id;
    }

    private function unidadeDoEstoque(int $medicationId): ?string
    {
        return DB::table('stock_items')->where('medication_id', $medicationId)->value('unit');
    }

    /**
     * Não dá para testar a migration depois do fato com `RefreshDatabase`:
     * ela roda ANTES de cada teste. O caminho é rodar o arquivo
     * explicitamente com os dados já no lugar, como o estado em que a
     * aplicação a encontra.
     */
    private function rodarMigration(): void
    {
        $migration = require database_path('migrations/2026_09_28_000000_fix_stock_unit_inherited_from_dosage.php');
        $migration->up();
    }

    public function test_converte_unidade_herdada_da_dose_para_comprimidos(): void
    {
        // O caso do bug: estoque com 'mg', dose com 'mg'. É certo que o
        // 'mg' veio do create() — nenhuma escolha consciente produz isso.
        $id = $this->criarCom('Losartana', 'mg', 'mg');
        $this->assertSame('mg', $this->unidadeDoEstoque($id));

        $this->rodarMigration();

        $this->assertSame('comprimidos', $this->unidadeDoEstoque($id));
    }

    public function test_NAO_mexe_em_unidade_que_difere_da_dose(): void
    {
        // Xarope: dose em ml, estoque escolhido em ml. As duas batem —
        // então ESTE é o caso que a migration não pode tocar, porque o
        // alvo 'comprimidos' seria errado para líquido. É o teste mais
        // importante do arquivo: é ele que impede a reescrita de
        // inventar dado.
        $id = $this->criarCom('Paracetamol', 'ml', 'ml');

        $this->rodarMigration();

        $this->assertSame('ml', $this->unidadeDoEstoque($id));
    }

    public function test_NAO_mexe_em_unidade_ja_corrigida_para_uma_unidade_de_contagem(): void
    {
        // Escolha real de quem cadastrou: dose em mg, estoque em gotas
        // (colírio). Não é herança — é intenção, e a migration tem que
        // respeitar.
        $id = $this->criarCom('Latanoprosta', 'mg', 'gotas');

        $this->rodarMigration();

        $this->assertSame('gotas', $this->unidadeDoEstoque($id));
    }

    public function test_NAO_mexe_quando_o_stock_esta_no_default_comprimidos(): void
    {
        // O caso pós-fix do controller: nada a converter.
        $id = $this->criarCom('Omeprazol', 'mg', 'comprimidos');

        $this->rodarMigration();

        $this->assertSame('comprimidos', $this->unidadeDoEstoque($id));
    }

    public function test_trata_cada_remedio_pelo_seu_proprio_par_e_nao_por_todos(): void
    {
        // A subquery tem que ser CORRELACIONADA: dois remédios, um com
        // 'mg' no estoque e outro com 'gotas'. Um update sem correlação
        // reescreveria os dois — e o de gotas seria inventar dado.
        $id1 = $this->criarCom('Losartana', 'mg', 'mg');
        $id2 = $this->criarCom('Latanoprosta', 'mg', 'gotas');
        $id3 = $this->criarCom('Paracetamol', 'ml', 'ml');

        $this->rodarMigration();

        $this->assertSame('comprimidos', $this->unidadeDoEstoque($id1));
        $this->assertSame('gotas', $this->unidadeDoEstoque($id2));
        $this->assertSame('ml', $this->unidadeDoEstoque($id3));
    }
}
