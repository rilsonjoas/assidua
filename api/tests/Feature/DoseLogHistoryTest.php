<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-07-15 12:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function createLog(Profile $profile, Medication $medication, array $overrides = []): DoseLog
    {
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        return DoseLog::create(array_merge([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now(),
            'status' => 'taken',
        ], $overrides));
    }

    public function test_lista_historico_do_perfil(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    // Marcador de troca de fuso (2026-09-11, entrevista de decisões de
    // horário — ver ROADMAP.md, item 6/20) — devolvido junto do
    // histórico, não como tabela separada de dose_logs. Fora do
    // paginador de doses (é uma fonte diferente), mas no mesmo response.
    public function test_historico_devolve_trocas_de_fuso_do_periodo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $profile->timezoneChanges()->create([
            'old_timezone' => 'America/Sao_Paulo',
            'new_timezone' => 'Europe/Lisbon',
            'changed_at' => now(),
        ]);
        // Fora da janela de 30 dias (usuário free) — não deve aparecer.
        $profile->timezoneChanges()->create([
            'old_timezone' => 'UTC',
            'new_timezone' => 'America/Sao_Paulo',
            'changed_at' => now()->subDays(40),
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(1, 'timezone_changes');
        $this->assertSame('Europe/Lisbon', $response->json('timezone_changes.0.new_timezone'));
    }

    public function test_filtra_por_status(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['status' => 'taken']);
        $this->createLog($profile, $medication, ['status' => 'skipped']);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history?status=skipped");

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('skipped', $response->json('data.0.status'));
    }

    public function test_filtra_por_medicamento(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medicationA = Medication::factory()->create(['profile_id' => $profile->id]);
        $medicationB = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medicationA);
        $this->createLog($profile, $medicationB);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history?medication_id={$medicationA->id}");

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($medicationA->id, $response->json('data.0.medication_id'));
    }

    public function test_filtra_por_intervalo_de_datas(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => Carbon::parse('2026-07-10 08:00:00')]);
        $this->createLog($profile, $medication, ['scheduled_at' => Carbon::parse('2026-07-14 08:00:00')]);

        $response = $this->actingAs($user)->getJson(
            "/api/profiles/{$profile->id}/doses/history?date_from=2026-07-13&date_to=2026-07-15"
        );

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_usuario_free_nao_ve_historico_com_mais_de_30_dias(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(5)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(45)]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_usuario_pro_ve_historico_alem_de_30_dias(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addMonth(),
        ]);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(5)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(45)]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");

        $response->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_nao_permite_ver_historico_de_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($intruder)
            ->getJson("/api/profiles/{$profile->id}/doses/history")
            ->assertForbidden();
    }

    // Bug real achado 2026-09-09 (auditoria pedida pelo Rilson depois do
    // bug do "sumiu do Hoje"): `scheduled_at`/`taken_at` são gravados no
    // banco como hora LOCAL do perfil, sem fuso — mas o cast `'datetime'`
    // do Eloquent lê esse valor cru e rotula com `config('app.timezone')`
    // (UTC), errado. Antes da correção, `history()` devolvia esta dose
    // (perfil em America/Recife, gravada às 08:00 local) como
    // "2026-07-15T08:00:00Z" — 3h adiantado do instante absoluto real
    // ("2026-07-15T11:00:00Z"), que é exatamente o que `today()` devolve
    // pra essa mesma dose. Corrigido lendo via
    // DoseLog::scheduledAtInTimezone/takenAtInTimezone (ver Model) em vez
    // do atributo cru do Eloquent, em todo lugar que serializa um DoseLog.
    public function test_scheduled_at_e_taken_at_batem_com_o_instante_absoluto_real_pra_perfil_fora_de_utc(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, [
            'scheduled_at' => '2026-07-15 08:00:00', // hora local do perfil
            'taken_at' => '2026-07-15 08:05:00',
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history");
        $response->assertOk();

        // America/Recife é UTC-3 (sem horário de verão desde 2019) — 08:00
        // local = 11:00 UTC. É o mesmo instante que `today()` calcularia
        // pra um schedule às 08:00 nesse perfil (ver GenerateScheduleOccurrences).
        $this->assertSame('2026-07-15T11:00:00.000000Z', $response->json('data.0.scheduled_at'));
        $this->assertSame('2026-07-15T11:05:00.000000Z', $response->json('data.0.taken_at'));
    }
}
