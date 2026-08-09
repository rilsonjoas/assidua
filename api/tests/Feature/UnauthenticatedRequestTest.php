<?php

namespace Tests\Feature;

use Tests\TestCase;

// Achado real em produção (2026-08-09): sem Accept: application/json,
// uma requisição não-autenticada numa rota protegida derrubava com 500
// (Authenticate tentava montar a rota nomeada "login", que não existe
// numa API pura) em vez de 401. Corrigido em bootstrap/app.php via
// redirectGuestsTo(null). Este teste simula exatamente isso: sem o
// header Accept que o client HTTP de teste do Laravel normalmente
// injeta.
class UnauthenticatedRequestTest extends TestCase
{
    public function test_rota_protegida_sem_accept_json_retorna_401_nao_500(): void
    {
        // get() puro, não getJson() — getJson() já injeta Accept:
        // application/json, o que mascararia exatamente o bug que
        // queremos cobrir (reproduz um curl cru/bot sem esse header).
        $response = $this->get('/api/auth/me');

        $response->assertUnauthorized();
    }
}
