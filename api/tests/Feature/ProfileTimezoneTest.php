<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Achado real (2026-08-10): "hoje" era calculado em UTC pro app inteiro,
// não no fuso de quem usa — quem está em Brasília (UTC-3) tinha a virada
// de dia 3h adiantada; em Manaus/Acre (UTC-4/-5), 4-5h. Esta suíte prova
// que o fuso do perfil agora é respeitado nos dois pontos que calculam
// "hoje": DoseLogController::today() e o comando doses:check-missed
// (via CheckMissedDoses, testado indiretamente pelo mesmo cálculo).
class ProfileTimezoneTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_perfil_novo_recebe_timezone_padrao_quando_nao_informado(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/profiles', ['name' => 'Vovó']);

        $response->assertCreated();
        $this->assertDatabaseHas('profiles', [
            'name' => 'Vovó',
            'timezone' => 'America/Sao_Paulo',
        ]);
    }

    public function test_cria_perfil_com_timezone_informado_pelo_app(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/profiles', [
            'name' => 'Rilson',
            'timezone' => 'America/Manaus',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('profiles', ['name' => 'Rilson', 'timezone' => 'America/Manaus']);
    }

    public function test_rejeita_timezone_invalido(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/profiles', [
            'name' => 'Rilson',
            'timezone' => 'Nao/Existe',
        ]);

        $response->assertUnprocessable()->assertJsonValidationErrors('timezone');
    }

    public function test_atualiza_timezone_de_perfil_existente(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);

        $response = $this->actingAs($user)->putJson("/api/profiles/{$profile->id}", [
            'timezone' => 'Europe/Lisbon',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('profiles', ['id' => $profile->id, 'timezone' => 'Europe/Lisbon']);
    }

    public function test_dose_nao_vira_perdida_antes_da_hora_no_fuso_do_perfil(): void
    {
        // 10h UTC = 07h em América/São_Paulo (UTC-3) — a dose das 08h
        // local ainda não chegou, mesmo já sendo "depois das 8" em UTC.
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk();
        $response->assertJsonFragment(['status' => 'pending']);
        $this->assertDatabaseMissing('dose_logs', ['medication_id' => $medication->id, 'status' => 'missed']);
    }

    public function test_dose_vira_perdida_depois_da_hora_no_fuso_do_perfil(): void
    {
        // 12h UTC = 09h em América/São_Paulo — agora sim, passou das 08h locais.
        Carbon::setTestNow(Carbon::parse('2026-07-15 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk();
        $response->assertJsonFragment(['status' => 'missed']);
        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'missed']);
    }

    public function test_dois_perfis_em_fusos_diferentes_veem_dias_diferentes_no_mesmo_instante(): void
    {
        // Meia-noite UTC: em Manaus (UTC-4) ainda é véspera às 20h — "hoje"
        // pra esse perfil ainda é o dia anterior. Em UTC, já virou o dia.
        Carbon::setTestNow(Carbon::parse('2026-07-15 00:00:00', 'UTC'));

        $user = User::factory()->create();

        $manaus = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Manaus']);
        $medManaus = Medication::factory()->create(['profile_id' => $manaus->id]);
        // Só ativo na terça (2) — dia 14/07 em Manaus nesse instante, não o 15.
        $medManaus->schedules()->create(['time' => '08:00:00', 'days_of_week' => [2]]);

        $utc = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medUtc = Medication::factory()->create(['profile_id' => $utc->id]);
        // Só ativo na quarta (3) — já é dia 15/07 em UTC nesse instante.
        $medUtc->schedules()->create(['time' => '08:00:00', 'days_of_week' => [3]]);

        $responseManaus = $this->actingAs($user)->getJson("/api/profiles/{$manaus->id}/doses/today");
        $responseUtc = $this->actingAs($user)->getJson("/api/profiles/{$utc->id}/doses/today");

        $responseManaus->assertOk()->assertJsonCount(1); // ainda terça em Manaus
        $responseUtc->assertOk()->assertJsonCount(1); // já quarta em UTC
    }
}
