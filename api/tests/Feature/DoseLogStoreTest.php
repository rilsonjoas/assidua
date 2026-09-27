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

    // =============================================================
    // P0 (2026-09-25, ROADMAP §9.9 item 7 e §10.4)
    //
    // Trava o contrato ANTES do E3. Hoje `dose_schedule_id` é
    // =============================================================
    // P4 (§10.4) — a dose AVULSA (PRN, "de resgate").
    //
    // Este bloco SUBSTITUI o teste que vivia aqui antes do P4, que
    // afirmava que `dose_schedule_id` nulo era sempre erro. A coluna
    // ficou anulável de propósito, então a afirmação inverteu: a dose
    // avulsa é `(dose_schedule_id, scheduled_at) = (NULL, NULL)` e a
    // identidade dela é o `client_key`. Sem este bloco, dá para
    // devolver todos os PRN de um paciente com o mesmo status, ou
    // duplicar a dose agendada, sem nenhum teste gritar.
    // =============================================================

    public function test_dose_de_resgate_e_registrada_sem_horario_previsto_e_indexada_por_client_key(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
            'client_key' => '11111111-1111-4111-8111-111111111111',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('dose_logs', [
            'client_key' => '11111111-1111-4111-8111-111111111111',
            'dose_schedule_id' => null,
            'scheduled_at' => null,
            'status' => 'taken',
        ]);
        $this->assertSame(1, DoseLog::count());
    }

    // O segundo colapso do §10.4, agora no servidor: duas doses de
    // resgate são `(NULL, NULL)` **as duas**. Se a chave não fosse o
    // `client_key`, a segunda sobrescreveria a primeira e o paciente
    // perderia um registro de saúde sem nenhum erro.
    public function test_duas_doses_de_resgate_nao_sobrescrevem_uma_a_outra(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
        ]);

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->subHour()->toISOString(),
            'status' => 'taken',
            'notes' => 'primeira',
            'client_key' => '22222222-2222-4222-8222-222222222222',
        ])->assertCreated();

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
            'notes' => 'segunda',
            'client_key' => '33333333-3333-4333-8333-333333333333',
        ])->assertCreated();

        $this->assertSame(2, DoseLog::count(), 'as duas doses de resgate precisam ser registros distintos');
        $this->assertDatabaseHas('dose_logs', ['notes' => 'primeira']);
        $this->assertDatabaseHas('dose_logs', ['notes' => 'segunda']);
    }

    // O reenvio da MESMA dose de resgate (a fila offline reenvia) tem que
    // atualizar, não duplicar — é o propósito do `client_key`.
    public function test_reenviar_a_mesma_dose_de_resgate_atualiza_em_vez_de_duplicar(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
        ]);

        $payload = [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
            'client_key' => '44444444-4444-4444-8444-444444444444',
        ];

        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();
        $this->actingAs($user)->postJson('/api/dose-logs', $payload + ['notes' => 'corrigida'])->assertCreated();

        $this->assertSame(1, DoseLog::count());
        $this->assertDatabaseHas('dose_logs', [
            'client_key' => '44444444-4444-4444-8444-444444444444',
            'notes' => 'corrigida',
        ]);
    }

    // O HÍBRIDO (agendada + client_key) foi aceito na primeira versão do
    // P4 e keyed pelo `client_key`. Aí, um reenvio da mesma dose agendada
    // SEM a chave caía no outro caminho e criava um log duplicado. O XOR
    // do guarda fecha isso; este teste trava o contrato.
    public function test_dose_agendada_sem_horario_e_rejeitada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // `scheduled_at` ficou anulável para a PRN, mas a dose agendada
        // continua sendo definida pelo horário. Sem esta guarda, esta
        // requisição gravasse uma linha que não pertence a dia nenhum:
        // o histórico não saberia onde colocá-la e a adesão não saberia
        // o que contar — sem erro em lugar nenhum.
        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, DoseLog::count());
    }

    public function test_dose_agendada_com_client_key_e_rejeitada(): void
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
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
            'client_key' => '55555555-5555-4555-8555-555555555555',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, DoseLog::count());
    }

    // Sem nenhum dos dois formatos não há identidade: não dá para saber
    // o que sobrescrever no reenvio, então nem se grava.
    public function test_dose_sem_horario_e_sem_client_key_e_rejeitada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, DoseLog::count());
    }

    // A porta da dose avulsa não pode virar IDOR: `exists:medications` só
    // diz que o remédio existe em ALGUM lugar. Sem o `where('profile_id')`
    // do guarda, dava para registrar dose de resgate num remédio alheio
    // com um `client_key` novo.
    public function test_dose_de_resgate_de_remedio_de_outro_perfil_e_rejeitada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $dono = User::factory()->create();
        $perfilAlheio = Profile::factory()->create(['user_id' => $dono->id]);
        $medicationAlheia = Medication::factory()->create([
            'profile_id' => $perfilAlheio->id,
            'is_prn' => true,
        ]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medicationAlheia->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
            'client_key' => '66666666-6666-4666-8666-666666666666',
        ]);

        $response->assertNotFound();
        $this->assertSame(0, DoseLog::count());
    }

    // "Pular" uma dose de resgate não significa nada — se não precisou,
    // não registra. E sem `taken_at` não há quando ela foi tomada.
    public function test_dose_de_resgate_pulada_ou_sem_taken_at_e_rejeitada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => true,
        ]);

        $pulada = $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'skipped',
            'client_key' => '77777777-7777-4777-8777-777777777777',
        ]);
        $pulada->assertStatus(422);

        $semTakenAt = $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'status' => 'taken',
            'client_key' => '88888888-8888-4888-8888-888888888888',
        ]);
        $semTakenAt->assertStatus(422);

        $this->assertSame(0, DoseLog::count());
    }

    // Remedio de horario fixo NAO e de resgate: registrar dose avulsa dele
    // criaria um registro que some do plano, e o app nem oferece a acao.
    public function test_dose_avulsa_de_remedio_com_horario_fixo_e_rejeitada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_prn' => false,
        ]);

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
            'client_key' => '99999999-9999-4999-8999-999999999999',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, DoseLog::count());
    }
}
