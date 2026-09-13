<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\DoseSchedule;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseScheduleTest extends TestCase
{
    use RefreshDatabase;

    public function test_cria_schedule_para_medicamento_do_proprio_usuario(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '08:00',
            'days_of_week' => [1, 3, 5],
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('dose_schedules', [
            'medication_id' => $medication->id,
        ]);
    }

    public function test_nao_permite_criar_schedule_em_medicamento_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($intruder)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '08:00',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('dose_schedules', 0);
    }

    public function test_rejeita_horario_em_formato_invalido(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '25:99',
        ]);

        $response->assertUnprocessable();
    }

    public function test_rejeita_dia_da_semana_fora_do_intervalo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '08:00',
            'days_of_week' => [7],
        ]);

        $response->assertUnprocessable();
    }

    // "Frequência de horário" (2026-08-14) — decisão de produto confirmada
    // com o Rilson. `interval_hours` já existia na validação/coluna
    // (achado ao investigar — nunca tinha sido ligado em lugar nenhum
    // que gera dose de verdade); estes testes cobrem só a criação/
    // validação — o efeito real (quantas doses gera) é coberto em
    // GenerateScheduleOccurrencesTest e nos testes de today()/streak/adesão.
    public function test_cria_schedule_de_intervalo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '07:00',
            'interval_hours' => 8,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('dose_schedules', [
            'medication_id' => $medication->id,
            'interval_hours' => 8,
        ]);
    }

    public function test_rejeita_intervalo_menor_que_1_hora(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson("/api/medications/{$medication->id}/schedules", [
            'time' => '07:00',
            'interval_hours' => 0,
        ]);

        $response->assertUnprocessable();
    }

    public function test_atualiza_schedule_fixo_para_intervalo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [1, 3, 5]]);

        $response = $this->actingAs($user)->putJson("/api/schedules/{$schedule->id}", [
            'interval_hours' => 6,
        ]);

        $response->assertOk();
        $schedule->refresh();
        $this->assertSame(6, $schedule->interval_hours);
    }

    public function test_atualiza_horario_e_dias_de_schedule_existente(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->putJson("/api/schedules/{$schedule->id}", [
            'time' => '21:30',
            'days_of_week' => [0, 6],
        ]);

        $response->assertOk();
        $schedule->refresh();
        // Comparado via Carbon porque SQLite (usado nos testes) não normaliza o formato
        // de colunas TIME como o MySQL (produção) faz.
        $this->assertSame('21:30:00', Carbon::parse($schedule->time)->format('H:i:s'));
        $this->assertSame([0, 6], $schedule->days_of_week);
    }

    public function test_nao_permite_atualizar_schedule_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($intruder)->putJson("/api/schedules/{$schedule->id}", [
            'time' => '09:00',
        ]);

        $response->assertForbidden();
    }

    // "Excluir horário não deveria apagar histórico" (entrevista de
    // horário, 2026-09-12) — decisão B do Rilson: não é mais hard delete
    // (achado real: cascateava e apagava TODO DoseLog daquele horário
    // sem aviso). Agora é desativação (`is_active=false`): some da lista
    // (index() já filtra por is_active) e para de gerar dose nova, mas a
    // linha e o histórico continuam no banco.
    public function test_remove_schedule(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->deleteJson("/api/schedules/{$schedule->id}");

        $response->assertNoContent();
        $this->assertDatabaseHas('dose_schedules', ['id' => $schedule->id, 'is_active' => false]);
    }

    public function test_remove_schedule_preserva_historico_de_dose_e_some_da_lista(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today('UTC')->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $this->actingAs($user)->deleteJson("/api/schedules/{$schedule->id}")->assertNoContent();

        // Log de verdade continua existindo, nada foi apagado em cascata.
        $this->assertDatabaseHas('dose_logs', ['id' => $log->id]);

        // Mas o horário desativado some da listagem que a tela usa.
        $index = $this->actingAs($user)->getJson("/api/medications/{$medication->id}/schedules");
        $index->assertOk()->assertJsonCount(0);
    }

    public function test_nao_permite_remover_schedule_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($intruder)->deleteJson("/api/schedules/{$schedule->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('dose_schedules', ['id' => $schedule->id]);
    }

    // "Dose fora do horário + recálculo" (item 8, 2026-09-08) — achado
    // real do Rilson: tomar o remédio de intervalo bem fora do previsto
    // deveria poder deslocar as doses restantes DAQUELE DIA, sem virar
    // o horário permanente.
    public function test_recalcula_hoje_para_schedule_de_intervalo(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-08 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'interval_hours' => 8]);

        $response = $this->actingAs($user)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '2026-09-08T10:00:00Z',
        ]);

        $response->assertOk();
        // Só 18h — não repete a âncora (10h) na lista de ocorrências
        // restantes: esse horário É a dose que a pessoa acabou de
        // registrar como tomada (ver GenerateScheduleOccurrencesTest,
        // achado de revisão de código 2026-09-08).
        $response->assertJsonPath('today_occurrences', [
            '2026-09-08T18:00:00+00:00',
        ]);
        $schedule->refresh();
        $this->assertSame('2026-09-08', $schedule->today_override_date->toDateString());
        $this->assertSame('10:00:00', Carbon::parse($schedule->today_override_time)->format('H:i:s'));

        Carbon::setTestNow();
    }

    // Fuso horário (2026-09-08, achado de auditoria registrado no
    // roadmap) — `anchor_time` agora é um instante absoluto (ISO 8601),
    // não mais "H:i" nu montado no fuso do APARELHO de quem confirma.
    // Um cuidador remoto num fuso diferente do perfil não pode mais
    // deslocar o recálculo sem querer: o backend converte pro fuso do
    // PERFIL antes de gravar.
    public function test_recalcula_hoje_converte_anchor_time_pro_fuso_do_perfil_nao_do_aparelho(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-08 12:00:00', 'UTC'));

        $user = User::factory()->create();
        // Perfil em São Paulo (UTC-3) — o "cuidador remoto" que confirma
        // o ajuste está em outro fuso qualquer, só o do PERFIL importa.
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'interval_hours' => 8]);

        // 13:00 UTC = 10:00 em America/Sao_Paulo (UTC-3) — o aparelho de
        // quem confirma pode estar em qualquer fuso, o que chega aqui é
        // o instante absoluto.
        $response = $this->actingAs($user)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '2026-09-08T13:00:00Z',
        ]);

        $response->assertOk();
        $schedule->refresh();
        $this->assertSame('10:00:00', Carbon::parse($schedule->today_override_time)->format('H:i:s'));

        Carbon::setTestNow();
    }

    public function test_recalcular_hoje_rejeita_schedule_de_horario_fixo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '2026-09-08T10:00:00Z',
        ]);

        $response->assertUnprocessable();
        $schedule->refresh();
        $this->assertNull($schedule->today_override_date);
    }

    public function test_recalcular_hoje_rejeita_horario_invalido(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'interval_hours' => 8]);

        $response = $this->actingAs($user)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '25:99',
        ]);

        $response->assertUnprocessable();
    }

    public function test_nao_permite_recalcular_hoje_de_schedule_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'interval_hours' => 8]);

        $response = $this->actingAs($intruder)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '2026-09-08T10:00:00Z',
        ]);

        $response->assertForbidden();
        $schedule->refresh();
        $this->assertNull($schedule->today_override_date);
    }
}
