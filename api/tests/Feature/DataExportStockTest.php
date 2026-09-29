<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Estoque no export (2026-09-28).
 *
 * Dois bugs achados nesta sessão, ambos silenciosos — que é o tipo de bug
 * que a suíte não pega porque o campo sai vazio e nada quebra:
 *
 * 1. O JSON lia `$medication->stock->low_stock_threshold`, atributo que
 *    NÃO existe. A coluna é `min_alert_quantity` (migration
 *    2026_06_28_000006) e é o nome que o app usa em
 *    `services/medications.ts`. A leitura devolvia `null` e o campo saía
 *    errado no nome.
 *
 * 2. O CSV tinha coluna "Estoque Atual" com SÓ o número. Sem unidade, "30"
 *    é ambíguo — e depois da correção da unidade do estoque (2026-09-28)
 *    a unidade passou a ser informação de primeira classe, justamente o
 *    que o export estava perdendo.
 *
 * O export não é consumido pelo app (rota `/api/me/export`, usada na web),
 * o que diminui a gravidade e aumenta o tempo que o bug ficou lá.
 */
class DataExportStockTest extends TestCase
{
    use RefreshDatabase;

    /**
     * `/api/me/export` é `signed`: não aceita GET autenticado, e sim uma
     * URL assinada que o próprio usuário pede em `POST /api/me/export-link`.
     * O id do usuário vai embutido na assinatura — é o que impede um link
     * de exportar os dados de outra pessoa.
     */
    private function urlDeExport(User $user, string $format): string
    {
        // `format` é parâmetro do POST autenticado e ENTRA na
        // assinatura. Acrescentar na query depois do link quebrar daria
        // 403 — foi o que aconteceu na primeira tentativa.
        $resposta = $this->actingAs($user)->postJson('/api/me/export-link', [
            'format' => $format,
        ]);
        $resposta->assertOk();
        return $resposta->json('url');
    }

    private function userComEstoque(): array
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
        ]);
        StockItem::create([
            'medication_id' => $medication->id,
            'current_quantity' => 30,
            'unit' => 'comprimidos',
            'min_alert_quantity' => 5,
            'last_updated_at' => '2026-09-01 10:00:00',
        ]);
        return [$user, $profile, $medication];
    }

    public function test_json_exporta_unidade_e_limite_do_estoque_com_o_nome_certo(): void
    {
        [$user, , $medication] = $this->userComEstoque();

        $response = $this->getJson($this->urlDeExport($user, 'json'));
        $response->assertOk();

        // A estrutura é aninhada: `owned_profiles[]` → `medications[]`.
        // Não há wrapper `data`.
        $med = collect($response->json('owned_profiles'))
            ->flatMap(fn ($p) => $p['medications'] ?? [])
            ->firstWhere('name', 'Losartana');

        $this->assertNotNull($med, 'Losartana não apareceu no export');
        $this->assertSame(30, (int) $med['stock']['current_quantity']);
        // O nome certo da coluna. O bug anterior devolvia `null` aqui,
        // porque lia um atributo inexistente — e `assertSame` pegaria
        // tanto o `null` quanto uma chave nova errada.
        $this->assertSame(5, (int) $med['stock']['min_alert_quantity']);
        $this->assertSame('comprimidos', $med['stock']['unit']);
        // E o atributo fantasma não pode reaparecer.
        $this->assertArrayNotHasKey('low_stock_threshold', $med['stock']);
        unset($medication);
    }

    public function test_csv_exporta_a_unidade_do_estoque_e_nao_so_o_numero(): void
    {
        [$user] = $this->userComEstoque();

        $response = $this->get($this->urlDeExport($user, 'csv'));
        $response->assertOk();

        $csv = $response->getContent();
        $linhas = array_filter(explode("\n", trim($csv)));

        // Cabeçalho: as colunas novas existem.
        $cabecalho = str_getcsv(reset($linhas), ';');
        $this->assertContains('Unidade do Estoque', $cabecalho);
        $this->assertContains('Aviso em', $cabecalho);

        // Linha do remédio: 30 e a unidade, na mesma linha. Sem a
        // unidade, o export entrega um número que não se sabe o que é.
        $linhaDados = collect($linhas)
            ->map(fn ($l) => str_getcsv($l, ';'))
            ->first(fn ($c) => in_array('Losartana', $c, true));

        $this->assertNotNull($linhaDados, 'linha do Losartana não apareceu no CSV');

        // Índice pelo NOME da coluna, não contando à mão. A primeira
        // versão contou posição e errou por um ("Pausado" ocupa a coluna
        // que eu jurava ser a de estoque) — o teste acusou o dado certo
        // no lugar errado, que é pior do que não testar.
        $idx = function (array $cabecalho, string $coluna): int {
            $i = array_search($coluna, $cabecalho, true);
            $this->assertNotFalse($i, "coluna '{$coluna}' não está no cabeçalho");
            return $i;
        };

        $this->assertSame('30', trim((string) $linhaDados[$idx($cabecalho, 'Estoque Atual')]));
        $this->assertSame('comprimidos', trim((string) $linhaDados[$idx($cabecalho, 'Unidade do Estoque')]));
        $this->assertSame('5', trim((string) $linhaDados[$idx($cabecalho, 'Aviso em')]));
    }

    public function test_linha_do_csv_tem_o_mesmo_numero_de_colunas_do_cabecalho(): void
    {
        // As colunas novas entraram no cabeçalho E nas duas variantes de
        // `fputcsv` (com e sem doses). Se uma delas ficasse para trás, o
        // CSV sairia desalinhado e ninguém veria — o arquivo abre, só
        // errado. Este teste é a rede contra isso.
        [$user] = $this->userComEstoque();

        $response = $this->get($this->urlDeExport($user, 'csv'));
        $response->assertOk();
        $csv = (string) $response->getContent();

        $linhas = array_values(array_filter(explode("\n", trim($csv))));
        $esperado = count(str_getcsv($linhas[0], ';'));

        foreach (array_slice($linhas, 1) as $linha) {
            $this->assertCount(
                $esperado,
                str_getcsv($linha, ';'),
                "linha com contagem de colunas diferente: {$linha}"
            );
        }
    }

    public function test_remedio_sem_estoque_sai_com_os_campos_vazios_e_nao_quebra(): void
    {
        // Guard: `$medication->stock` pode ser null, e o ternário em
        // ambos os formatos tem que respeitar isso.
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Sem Estoque']);

        $this->getJson($this->urlDeExport($user, 'json'))->assertOk();
        $this->get($this->urlDeExport($user, 'csv'))->assertOk();
    }
}
