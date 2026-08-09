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
        config(['database.connections.sqlite.database' => '/caminho/que/nao/existe/banco.sqlite']);
        DB::purge('sqlite');

        $response = $this->getJson('/up');

        $response->assertStatus(500);
        $response->assertJsonFragment(['status' => 'down']);
    }
}
