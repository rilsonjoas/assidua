<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// P2 — Saúde & Resiliência (2026-08-09). Achado real: /up sozinho só
// confirmava "processo de pé" — testava nada do banco. Sem isso, um
// Postgres fora do ar continuaria sendo reportado como app saudável
// pro Uptime Kuma, alerta falso-negativo bem na hora que mais importa.
class HealthCheckTest extends TestCase
{
    public function test_up_reporta_saudavel_com_banco_disponivel(): void
    {
        $response = $this->getJson('/up');

        $response->assertOk();
    }

    public function test_up_reporta_falha_quando_banco_esta_inacessivel(): void
    {
        config(['app.debug' => false]); // produção real roda assim; com debug=true a exceção sobe crua em vez de virar 500

        // Achado real (2026-09-27, ao rodar a suíte no PostgreSQL pela
        // primeira vez): este teste quebrava a conexão **sqlite** com
        // nome fixo, então passava no SQLite e falhava no Postgres — o
        // health check respondia 200 porque o banco estava de pé. A
        // suíte que roda é a que diria que o banco está inacessível sem
        // nunca desligar o banco de ninguém.
        //
        // Agora quebra a conexão do driver QUE ESTÁ EM USO: arquivo
        // inexistente no SQLite, porta fechada nos servidores. Porta 1
        // recusada na hora, sem espera.
        $conn = config('database.default');
        $config = config("database.connections.{$conn}");

        config(["database.connections.{$conn}" => match (config("database.connections.{$conn}.driver")) {
            'sqlite' => [...$config, 'database' => '/caminho/que/nao/existe/banco.sqlite'],
            'pgsql', 'mysql', 'mariadb' => [...$config, 'host' => '127.0.0.1', 'port' => 1],
            default => [...$config, 'database' => '/caminho/que/nao/existe/banco.sqlite'],
        }]);
        DB::purge($conn);

        $response = $this->getJson('/up');

        $response->assertStatus(500);
        $response->assertJsonFragment(['status' => 'down']);
    }
}
