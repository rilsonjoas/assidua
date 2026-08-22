<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

// LGPD art. 18, V — portabilidade de dados. Fluxo em duas etapas:
// endpoint autenticado gera URL assinada; download é público mas só
// funciona com assinatura válida e não expirada.
class DataExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_gerar_link_exige_autenticacao(): void
    {
        $this->postJson('/api/me/export-link')->assertStatus(401);
    }

    public function test_link_retorna_url_assinada_que_funciona(): void
    {
        $user = User::factory()->create();
        $profile = $user->profiles()->create([
            'name' => 'Rilson',
            'color' => '#6366f1',
            'avatar_emoji' => 'account',
            'timezone' => 'America/Recife',
        ]);
        $medication = $profile->medications()->create([
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
            'color' => '#ef4444',
            'is_active' => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/me/export-link');

        $response->assertOk()->assertJsonStructure(['url']);

        // O id do usuário precisa estar embutido na URL — sem ele o
        // download não sabe de quem são os dados.
        $this->assertStringContainsString('user=' . $user->id, $response->json('url'));

        $download = $this->getJson($response->json('url'));

        $download->assertOk()
            ->assertHeader('Content-Disposition', 'attachment; filename="assidua-dados.json"')
            ->assertJsonPath('account.email', $user->email)
            ->assertJsonPath('owned_profiles.0.name', 'Rilson')
            ->assertJsonPath('owned_profiles.0.medications.0.name', 'Losartana');
    }

    public function test_download_rejeita_url_com_id_trocado(): void
    {
        $user = User::factory()->create();

        $url = URL::temporarySignedRoute('me.export', now()->addMinutes(10), ['user' => $user->id]);

        // Outra conta tenta se passar pelo id da primeira: a assinatura
        // cobre o parâmetro, então trocá-lo invalida a URL inteira.
        $tampered = str_replace('user=' . $user->id, 'user=999999', $url);

        $this->getJson($tampered)->assertStatus(403);
    }

    public function test_download_rejeita_url_sem_assinatura(): void
    {
        User::factory()->create(['id' => 1]);

        $this->getJson('/api/me/export?user=1')->assertStatus(403);
    }

    public function test_export_nao_inclui_dados_de_outros_usuarios(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $otherProfile = $other->profiles()->create([
            'name' => 'Perfil Alheio',
            'color' => '#000000',
            'avatar_emoji' => 'account',
            'timezone' => 'America/Recife',
        ]);
        $otherProfile->medications()->create([
            'name' => 'Remedio Alheio',
            'is_active' => true,
        ]);

        $url = $this->actingAs($user)->postJson('/api/me/export-link')->json('url');
        $payload = $this->getJson($url)->json();

        $this->assertSame([], $payload['shared_profiles_as_caregiver']);
        $this->assertStringNotContainsString('Remedio Alheio', json_encode($payload));
    }
}
