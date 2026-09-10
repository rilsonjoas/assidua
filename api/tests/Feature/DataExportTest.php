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

    // Bug real achado 2026-09-09 (auditoria de fuso pedida pelo Rilson):
    // export JSON (LGPD, portabilidade) devolvia `scheduled_at`/`taken_at`
    // rotulados com o fuso errado (UTC do app, não o do perfil) — pra
    // perfil fora de UTC, o próprio documento oficial de "meus dados"
    // mostrava hora errada. Ver DoseLog::scheduledAtInTimezone.
    public function test_export_json_devolve_scheduled_at_e_taken_at_no_instante_absoluto_certo(): void
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
        $schedule = $medication->schedules()->create(['time' => '08:00', 'is_active' => true]);
        $medication->doseLogs()->create([
            'profile_id' => $profile->id,
            'dose_schedule_id' => $schedule->id,
            'scheduled_at' => '2026-08-23 08:00:00', // hora local do perfil
            'taken_at' => '2026-08-23 08:05:00',
            'status' => 'taken',
        ]);

        $response = $this->actingAs($user)->postJson('/api/me/export-link');
        $download = $this->getJson($response->json('url'));
        $download->assertOk();

        $log = $download->json('owned_profiles.0.medications.0.dose_logs.0');
        // America/Recife é UTC-3 — 08:00/08:05 local = 11:00/11:05 UTC.
        $this->assertSame('2026-08-23T11:00:00.000000Z', $log['scheduled_at']);
        $this->assertSame('2026-08-23T11:05:00.000000Z', $log['taken_at']);
    }

    public function test_export_csv_link_e_download(): void
    {
        $user = User::factory()->create();
        $profile = $user->profiles()->create([
            'name' => 'Maria',
            'color' => '#6366f1',
            'avatar_emoji' => 'account',
            'timezone' => 'America/Recife',
        ]);
        $medication = $profile->medications()->create([
            'name' => 'Dipirona',
            'dosage' => '500',
            'unit' => 'mg',
            'color' => '#ef4444',
            'is_active' => true,
        ]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00',
            'is_active' => true,
        ]);
        $medication->doseLogs()->create([
            'profile_id' => $profile->id,
            'dose_schedule_id' => $schedule->id,
            'scheduled_at' => '2026-08-23 08:00:00',
            'taken_at' => '2026-08-23 08:05:00',
            'status' => 'taken',
        ]);

        $response = $this->actingAs($user)->postJson('/api/me/export-link', ['format' => 'csv']);
        $response->assertOk()->assertJsonStructure(['url']);
        $this->assertStringContainsString('format=csv', $response->json('url'));

        $download = $this->get($response->json('url'));
        $download->assertOk()
            ->assertHeader('Content-Disposition', 'attachment; filename="assidua-dados.csv"')
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $content = $download->getContent();
        $this->assertStringContainsString('Perfil;Medicamento;Dosagem', $content);
        $this->assertStringContainsString('Maria', $content);
        $this->assertStringContainsString('Dipirona', $content);
        $this->assertStringContainsString('Tomado', $content);
    }

    // Achado de auditoria de segurança (2026-09-08, CSV Formula
    // Injection): campo de texto livre (notas) começando com "=" virava
    // uma fórmula ativa se a pessoa abrisse o CSV no Excel/Sheets.
    public function test_export_csv_neutraliza_formula_em_campo_de_texto_livre(): void
    {
        $user = User::factory()->create();
        $profile = $user->profiles()->create([
            'name' => 'Maria',
            'color' => '#6366f1',
            'avatar_emoji' => 'account',
            'timezone' => 'America/Recife',
        ]);
        $profile->medications()->create([
            'name' => '=1+1',
            'dosage' => '500',
            'unit' => 'mg',
            'notes' => '+CMD',
            'color' => '#ef4444',
            'is_active' => true,
        ]);

        $url = $this->actingAs($user)->postJson('/api/me/export-link', ['format' => 'csv'])->json('url');
        $content = $this->get($url)->getContent();

        $this->assertStringNotContainsString(';=1+1', $content);
        $this->assertStringContainsString("'=1+1", $content);
        $this->assertStringContainsString("'+CMD", $content);
    }
}
