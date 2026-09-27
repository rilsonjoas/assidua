<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * O Sentry de PRODUÇÃO só pode reportar em produção.
 *
 * Este teste existe porque a mesma armadilha já custou DOIS alertas
 * falsos no projeto de produção:
 *
 *  - 2026-08-09: `php artisan test` local mandava evento a cada
 *    exceção. Corrigido bloqueando `APP_ENV === 'testing'`.
 *  - 2026-09-27: `php artisan migrate` local com `APP_ENV=local`
 *    (que não é `testing`) disparou "high priority" no Sentry de
 *    produção — `could not find driver` e `Connection refused`.
 *    Nenhum dos dois era problema de produção.
 *
 * A correção da primeira vez foi lista de **bloqueio** ("não seja
 * testing"), que resolve um ambiente e deixa todo valor novo escapar.
 * A de agora é lista de **permissão** ("só production").
 *
 * O teste que mais importa é `test_producao_continua_reportando`: se a
 * correção desligar o monitoramento do ambiente real, um banco fora do
 * ar passa despercebido, que é pior que alerta falso.
 */
class SentryEnvironmentTest extends TestCase
{
    /**
     * Carrega o `config/sentry.php` DE VERDADE, com o ambiente forjado.
     *
     * Não copia a expressão para cá de propósito: uma cópia passa a
     * testar a si mesma, e a config real pode divergir sem que ninguém
     * perceba. O que é verificado aqui é o arquivo que o servidor
     * executa.
     */
    private function dsnRealCom(string $appEnv): mixed
    {
        $original = $_SERVER['APP_ENV'] ?? null;

        // O `env()` do Laravel lê por trás de `$_SERVER`/`$_ENV`, e o
        // `.env` local já foi carregado no bootstrap — então é aqui que
        // o valor do processo é trocado.
        $_SERVER['APP_ENV'] = $appEnv;
        $_ENV['APP_ENV'] = $appEnv;
        $_SERVER['SENTRY_LARAVEL_DSN'] = 'https://chave@o1.ingest.sentry.io/1';
        $_ENV['SENTRY_LARAVEL_DSN'] = $_SERVER['SENTRY_LARAVEL_DSN'];

        try {
            $config = require config_path('sentry.php');

            return $config['dsn'] ?? null;
        } finally {
            // Restaurar: sem isto, o resto da suíte rodaria com um
            // APP_ENV forjado por acidente — e o efeito colateral seria
            // pior que o bug original.
            foreach (['APP_ENV' => $original, 'SENTRY_LARAVEL_DSN' => null] as $chave => $valor) {
                if ($valor === null) {
                    unset($_SERVER[$chave], $_ENV[$chave]);
                } else {
                    $_SERVER[$chave] = $valor;
                    $_ENV[$chave] = $valor;
                }
            }
        }
    }

    public function test_producao_continua_reportando(): void
    {
        $this->assertNotNull(
            $this->dsnRealCom('production'),
            'produção tem que continuar reportando para o Sentry — sem alerta, banco fora do ar passa despercebido'
        );
    }

    #[DataProvider('ambientesQueNaoDevemReportar')]
    public function test_ambiente_que_nao_e_producao_nao_reporta(string $appEnv): void
    {
        $this->assertNull(
            $this->dsnRealCom($appEnv),
            "APP_ENV={$appEnv} não pode reportar no Sentry de produção"
        );
    }

    /** @return array<string, array{string}> */
    public static function ambientesQueNaoDevemReportar(): array
    {
        return [
            // `local` é o que causou os dois alertas de 2026-09-27.
            'local' => ['local'],
            'testing' => ['testing'],
            // Ambientes que ainda não existem, listados de propósito: a
            // lista de permissão tem que nascer fechada, senão o próximo
            // ambiente novo abre o mesmo furo.
            'staging' => ['staging'],
            'dev' => ['dev'],
            'ci' => ['ci'],
            // String vazia: é o que acontece sem `.env` presente, e era
            // exatamente o caso que a regra antiga deixava passar.
            'vazio' => [''],
        ];
    }

    public function test_regra_e_lista_de_permissao_e_nao_de_bloqueio(): void
    {
        $linha = collect(file(config_path('sentry.php')))
            ->first(fn ($l) => str_contains($l, "'dsn' =>"));

        $this->assertIsString($linha, 'a chave dsn sumiu do config/sentry.php');

        // A FORMA da regra importa tanto quanto o resultado. O teste de
        // comportamento acima passaria com `=== 'testing' ? null : dsn`
        // para o ambiente `testing` — o único que ele cobre. É a forma
        // que deixou o `local` escapar duas vezes.
        $this->assertStringContainsString(
            "in_array(env('APP_ENV')",
            $linha,
            'a regra do dsn deveria ser lista de permissão sobre APP_ENV'
        );
        $this->assertStringNotContainsString(
            "=== 'testing'",
            $linha,
            "a regra do dsn voltou a ser lista de bloqueio ('não seja testing'), e o APP_ENV=local volta a reportar"
        );
    }
}
