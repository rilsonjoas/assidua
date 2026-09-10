<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogStoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_registra_dose_tomada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $scheduledAt = Carbon::today()->setTimeFromTimeString('08:00:00');

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt->toISOString(),
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'status' => 'taken',
        ]);
        $this->assertSame(1, DoseLog::count());
    }

    public function test_reenviar_mesma_dose_atualiza_em_vez_de_duplicar(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $scheduledAt = Carbon::today()->setTimeFromTimeString('08:00:00');

        $payload = [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt->toISOString(),
            'status' => 'taken',
        ];

        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();

        // Usuário muda de ideia e marca como pulado — mesmo schedule + horário.
        $response = $this->actingAs($user)->postJson('/api/dose-logs', array_merge($payload, [
            'status' => 'skipped',
        ]));

        $response->assertCreated();
        $this->assertSame(1, DoseLog::count());
        $this->assertDatabaseHas('dose_logs', ['status' => 'skipped']);
    }

    public function test_nao_permite_registrar_dose_de_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($intruder)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertForbidden();
        $this->assertSame(0, DoseLog::count());
    }

    // Achado de auditoria de segurança (2026-09-08, IDOR): dose_schedule_id/
    // medication_id só eram validados como "existe em algum lugar do
    // banco", sem checar que pertencem ao profile_id autorizado. Um
    // usuário podia enviar seu PRÓPRIO profile_id (passa no Gate) junto
    // com um dose_schedule_id de OUTRO perfil — vazando nome/dosagem do
    // medicamento alheio na resposta e sobrescrevendo o DoseLog dele.
    public function test_dose_schedule_id_de_outro_perfil_e_rejeitado(): void
    {
        $attacker = User::factory()->create();
        $attackerProfile = Profile::factory()->create(['user_id' => $attacker->id]);

        $victim = User::factory()->create();
        $victimProfile = Profile::factory()->create(['user_id' => $victim->id]);
        $victimMedication = Medication::factory()->create(['profile_id' => $victimProfile->id, 'name' => 'Remédio Sigiloso da Vítima']);
        $victimSchedule = $victimMedication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($attacker)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $victimSchedule->id,
            'medication_id' => $victimMedication->id,
            'profile_id' => $attackerProfile->id, // próprio profile, passa no Gate
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertNotFound();
        $this->assertSame(0, DoseLog::count());
        $response->assertDontSee('Remédio Sigiloso da Vítima');
    }

    public function test_medication_id_que_nao_bate_com_o_schedule_e_rejeitado(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medicationA = Medication::factory()->create(['profile_id' => $profile->id]);
        $medicationB = Medication::factory()->create(['profile_id' => $profile->id]);
        $scheduleA = $medicationA->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $scheduleA->id,
            'medication_id' => $medicationB->id, // não é o medicamento do schedule A
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertNotFound();
        $this->assertSame(0, DoseLog::count());
    }

    public function test_rejeita_status_invalido(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'invalido',
        ]);

        $response->assertUnprocessable();
    }

    public function test_registra_dose_tomada_decrementa_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ])->assertCreated();

        $this->assertEquals(9, $stock->fresh()->current_quantity);
    }

    public function test_registra_dose_pulada_nao_altera_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'skipped',
        ])->assertCreated();

        $this->assertEquals(10, $stock->fresh()->current_quantity);
    }

    public function test_alterar_dose_de_tomada_para_pulada_estorna_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $payload = [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'taken',
        ];

        // 10 -> 9
        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();
        $this->assertEquals(9, $stock->fresh()->current_quantity);

        // 9 -> 10 (status alterado para skipped)
        $this->actingAs($user)->postJson('/api/dose-logs', array_merge($payload, ['status' => 'skipped']))->assertCreated();
        $this->assertEquals(10, $stock->fresh()->current_quantity);
    }

    public function test_alterar_dose_de_pulada_para_tomada_decrementa_estoque(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $stock = $medication->stock()->create(['current_quantity' => 10, 'min_alert_quantity' => 2]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $payload = [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'status' => 'skipped',
        ];

        // 10 -> 10 (skipped)
        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();
        $this->assertEquals(10, $stock->fresh()->current_quantity);

        // 10 -> 9 (status alterado para taken)
        $this->actingAs($user)->postJson('/api/dose-logs', array_merge($payload, ['status' => 'taken']))->assertCreated();
        $this->assertEquals(9, $stock->fresh()->current_quantity);
    }

    // Bug real achado 2026-09-09 (auditoria de fuso pedida pelo Rilson):
    // `scheduled_at` já convertia pro fuso do perfil antes de gravar
    // (2026-09-08) — `taken_at` nunca convertia, gravava a leitura em UTC
    // do instante como se já fosse hora local do perfil. Pra perfil fora
    // de UTC, todo `taken_at` gravado ficava sistematicamente deslocado
    // pelo offset. Este teste garante que os dois campos terminam
    // gravados na MESMA convenção (hora local do perfil, sem fuso).
    public function test_taken_at_grava_na_mesma_convencao_de_scheduled_at_pra_perfil_fora_de_utc(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // O app manda instantes absolutos (toISOString()) — 08:00 e 08:05
        // em America/Recife (UTC-3) equivalem a 11:00 e 11:05 UTC.
        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15T11:00:00.000Z',
            'taken_at' => '2026-07-15T11:05:00.000Z',
            'status' => 'taken',
        ]);
        $response->assertCreated();

        // Gravado no banco como hora LOCAL do perfil, sem fuso — mesma
        // convenção nos dois campos.
        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 08:05:00',
        ]);

        // E a resposta HTTP devolve o instante absoluto certo de volta,
        // não a leitura crua do banco rotulada com o fuso errado.
        $this->assertSame('2026-07-15T11:00:00.000000Z', $response->json('scheduled_at'));
        $this->assertSame('2026-07-15T11:05:00.000000Z', $response->json('taken_at'));
    }
}
