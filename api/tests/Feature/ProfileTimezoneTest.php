<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\ProfileTimezoneChange;
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

    // Marcador de troca de fuso (2026-09-11, entrevista de decisões de
    // horário — ver ROADMAP.md, item 6/20) — "transparência total"
    // pedida pelo Rilson: a troca fica registrada de verdade, não só um
    // toast que passa e some.
    public function test_troca_de_timezone_registra_marcador(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);

        $this->actingAs($user)->putJson("/api/profiles/{$profile->id}", [
            'timezone' => 'Europe/Lisbon',
        ])->assertOk();

        $this->assertDatabaseHas('profile_timezone_changes', [
            'profile_id' => $profile->id,
            'old_timezone' => 'America/Sao_Paulo',
            'new_timezone' => 'Europe/Lisbon',
        ]);
    }

    // Evita marcador fantasma: `syncOwnedProfileTimezones` (app) manda
    // PUT com o fuso do aparelho toda vez que a Hoje carrega, mesmo sem
    // mudança real — não é pra virar um marcador novo cada vez.
    public function test_reenviar_o_mesmo_timezone_nao_cria_marcador(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);

        $this->actingAs($user)->putJson("/api/profiles/{$profile->id}", [
            'timezone' => 'America/Sao_Paulo',
        ])->assertOk();

        $this->assertSame(0, ProfileTimezoneChange::count());
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

    // Tolerância de 24h (2026-09-11, entrevista de decisões de horário
    // — ver ROADMAP.md): 1h de atraso não basta mais pra virar "missed"
    // em lugar nenhum (nem no endpoint /doses/today — que aliás nunca
    // mais marca "missed" sozinho, só olha "hoje", nunca 24h+ dentro do
    // mesmo dia — ver DoseLogTodayTest). Quem decide "missed" de verdade
    // agora é o cron `doses:check-missed`; este teste passa a provar
    // que a conversão de fuso continua certa NELE, não mais no endpoint.
    public function test_dose_vira_perdida_depois_de_24h_no_fuso_do_perfil(): void
    {
        // 08h locais em SP (UTC-3) de 15/07 = 11h UTC. +24h = 11h UTC de
        // 16/07. "Agora" 1min depois disso, ainda em fuso local diferente
        // de UTC — prova que a comparação usa o fuso do PERFIL, não o do
        // servidor.
        Carbon::setTestNow(Carbon::parse('2026-07-16 11:01:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'missed']);
    }

    // Mesmo cenário, mas ainda DENTRO das 24h — não pode marcar ainda,
    // nem no endpoint (nunca marca "hoje" sozinho) nem no cron.
    public function test_dose_nao_vira_perdida_antes_de_completar_24h_no_fuso_do_perfil(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 12:00:00', 'UTC')); // 09h em SP, só 1h de atraso

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // days_of_week só na quarta (15/07 é quarta em SP nesse instante
        // também) — sem isso o schedule também gera a ocorrência de
        // ONTEM (14/07 08h local), que já passaria de 24h de atraso de
        // verdade e seria corretamente marcada, mascarando o que este
        // teste quer provar (mesmo padrão do fix em
        // CheckMissedDosesCommandTest).
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [3]]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");
        $response->assertOk()->assertJsonFragment(['status' => 'pending']);

        $this->artisan('doses:check-missed')->assertSuccessful();
        $this->assertSame(0, DoseLog::count());
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
