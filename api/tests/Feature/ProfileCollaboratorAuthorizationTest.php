<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Fase 1.5, Etapa 3 — matriz dono/colaborador/estranho pra cada recurso
// que foi tocado. Confirma que "colaborador pode ver e agir sobre dose/
// estoque" e "colaborador NÃO pode gerenciar cadastro" são regras reais,
// não só intenção documentada nos comentários das Policies.
class ProfileCollaboratorAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function makeSetup(): array
    {
        $owner = User::factory()->create();
        $collaborator = User::factory()->create();
        $stranger = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $medication->stock()->create(['current_quantity' => 10]);

        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $owner->id,
            'user_id' => $collaborator->id,
        ]);

        return compact('owner', 'collaborator', 'stranger', 'profile', 'medication', 'schedule');
    }

    public function test_colaborador_ve_doses_de_hoje_mas_estranho_nao(): void
    {
        ['collaborator' => $collaborator, 'stranger' => $stranger, 'profile' => $profile] = $this->makeSetup();

        $this->actingAs($collaborator)->getJson("/api/profiles/{$profile->id}/doses/today")->assertOk();
        $this->actingAs($stranger)->getJson("/api/profiles/{$profile->id}/doses/today")->assertForbidden();
    }

    public function test_colaborador_ve_historico_mas_estranho_nao(): void
    {
        ['collaborator' => $collaborator, 'stranger' => $stranger, 'profile' => $profile] = $this->makeSetup();

        $this->actingAs($collaborator)->getJson("/api/profiles/{$profile->id}/doses/history")->assertOk();
        $this->actingAs($stranger)->getJson("/api/profiles/{$profile->id}/doses/history")->assertForbidden();
    }

    public function test_colaborador_marca_dose_como_tomada(): void
    {
        ['collaborator' => $collaborator, 'profile' => $profile, 'medication' => $medication, 'schedule' => $schedule] = $this->makeSetup();

        $response = $this->actingAs($collaborator)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
    }

    public function test_estranho_nao_marca_dose(): void
    {
        ['stranger' => $stranger, 'profile' => $profile, 'medication' => $medication, 'schedule' => $schedule] = $this->makeSetup();

        $response = $this->actingAs($stranger)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertForbidden();
    }

    public function test_colaborador_desfaz_dose_marcada_pelo_dono(): void
    {
        ['owner' => $owner, 'collaborator' => $collaborator, 'profile' => $profile, 'medication' => $medication, 'schedule' => $schedule] = $this->makeSetup();
        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now(),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $response = $this->actingAs($collaborator)->deleteJson("/api/dose-logs/{$log->id}");

        $response->assertNoContent();
    }

    public function test_colaborador_ve_medicamento_mas_nao_edita(): void
    {
        ['collaborator' => $collaborator, 'medication' => $medication] = $this->makeSetup();

        $this->actingAs($collaborator)->getJson("/api/medications/{$medication->id}")->assertOk();
        $this->actingAs($collaborator)->putJson("/api/medications/{$medication->id}", ['name' => 'Outro nome'])
            ->assertForbidden();
    }

    public function test_colaborador_nao_cadastra_medicamento_novo(): void
    {
        ['collaborator' => $collaborator, 'profile' => $profile] = $this->makeSetup();

        $response = $this->actingAs($collaborator)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Novo remédio',
            'dosage' => '10',
        ]);

        $response->assertForbidden();
    }

    public function test_colaborador_nao_cria_horario_novo(): void
    {
        ['collaborator' => $collaborator, 'medication' => $medication] = $this->makeSetup();

        $response = $this->actingAs($collaborator)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '20:00',
        ]);

        $response->assertForbidden();
    }

    public function test_colaborador_nao_edita_horario_existente(): void
    {
        ['collaborator' => $collaborator, 'schedule' => $schedule] = $this->makeSetup();

        $response = $this->actingAs($collaborator)->putJson("/api/schedules/{$schedule->id}", ['time' => '20:00']);

        $response->assertForbidden();
    }

    public function test_colaborador_reabastece_estoque(): void
    {
        ['collaborator' => $collaborator, 'medication' => $medication] = $this->makeSetup();

        $response = $this->actingAs($collaborator)->putJson("/api/medications/{$medication->id}/stock", [
            'current_quantity' => 30,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('stock_items', ['medication_id' => $medication->id, 'current_quantity' => 30]);
    }

    public function test_estranho_nao_ve_nem_reabastece_estoque(): void
    {
        ['stranger' => $stranger, 'medication' => $medication] = $this->makeSetup();

        $this->actingAs($stranger)->getJson("/api/medications/{$medication->id}/stock")->assertForbidden();
        $this->actingAs($stranger)->putJson("/api/medications/{$medication->id}/stock", ['current_quantity' => 1])
            ->assertForbidden();
    }

    public function test_colaborador_nao_gerencia_o_perfil_em_si(): void
    {
        ['collaborator' => $collaborator, 'profile' => $profile] = $this->makeSetup();

        $this->actingAs($collaborator)->putJson("/api/profiles/{$profile->id}", ['name' => 'Outro nome'])
            ->assertForbidden();
        $this->actingAs($collaborator)->deleteJson("/api/profiles/{$profile->id}")
            ->assertForbidden();
        // Também não pode convidar mais gente nem ver a lista de colaboradores.
        $this->actingAs($collaborator)->postJson("/api/profiles/{$profile->id}/collaborators")
            ->assertForbidden();
        $this->actingAs($collaborator)->getJson("/api/profiles/{$profile->id}/collaborators")
            ->assertForbidden();
    }

    // =============================================================
    // P0 (2026-09-25, ROADMAP §9.11) — autoria.
    //
    // ⚠️ ESTES DOIS SUBSTITUEM a versão anterior, que afirmava
    // "cuidador não desfaz dose do dono". A regra mudou em 2026-09-25
    // (§9.11): o Rilson trocou a RESTRIÇÃO pela ATRIBUIÇÃO.
    //
    // > Mesmo poder que o dono sobre o registro de dose — e tudo que o
    // > cuidador toca fica assinado.
    //
    // Motivo declarado: a restrição resolvia o risco de "cuidador não mal
    // intencionado sujar dados", mas criava a armadilha de o cuidador errar
    // o registro e não ter como corrigir. A transparência substitui a
    // licença moral, e a assimetria vira rastreabilidade em vez de
    // permissão.
    //
    // `test_colaborador_desfaz_dose_marcada_pelo_dono` (acima) continua
    // PASSANDO e continua correto sob a regra nova — agora ele precisa
    // virar "pode desfaz, E FICA ASSINADO" (§9.11 item 5).
    // =============================================================

    public function test_colaborador_registra_dose_com_autoria_presente(): void
    {
        $this->markTestSkipped('P6 pendente — ROADMAP §9.11: exige recorded_by_user_id');

        ['owner' => $owner, 'collaborator' => $collaborator, 'profile' => $profile, 'medication' => $medication, 'schedule' => $schedule] = $this->makeSetup();

        $response = $this->actingAs($collaborator)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now()->toISOString(),
            'taken_at' => now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();

        // A autoria NAO vem do cliente — e o backend que decide quem e.
        // Se viesse no payload, qualquer cuidador escreveria o nome do dono
        // e a auditoria inteira nao valeria nada.
        $this->assertDatabaseHas('dose_logs', [
            'recorded_by_user_id' => $collaborator->id, // <- coluna que ainda nao existe
        ]);
    }

    public function test_colaborador_que_altera_registro_deixa_rastro_no_log_de_eventos(): void
    {
        $this->markTestSkipped('P6 pendente — ROADMAP §9.11: delete precisa deixar rastro (hoje e hard delete)');

        ['owner' => $owner, 'collaborator' => $collaborator, 'profile' => $profile, 'medication' => $medication, 'schedule' => $schedule] = $this->makeSetup();
        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now(),
            'taken_at' => now(),
            'status' => 'taken',
            'recorded_by_user_id' => $owner->id,
        ]);

        // Paridade: o cuidador PODE desfazer a dose do dono agora. O que
        // mudou nao e a permissao — e que a acao fica registrada.
        $response = $this->actingAs($collaborator)->deleteJson("/api/dose-logs/{$log->id}");
        $response->assertNoContent();

        // ...e o rastro existe. Num hard delete puro (o que o app faz
        // hoje) a linha some e nao sobraria prova de nada.
        $this->assertDatabaseHas('dose_log_events', [
            'dose_log_id' => $log->id,
            'actor_user_id' => $collaborator->id,
            'action' => 'deleted',
        ]);
    }
}
