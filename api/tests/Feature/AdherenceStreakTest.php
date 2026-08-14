<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Fase 2 (2026-08-11) — streak de adesão. Todo perfil aqui usa timezone
// 'UTC' (mesma razão do DoseLogTodayTest: "hora congelada" == "hora
// local", sem acoplar com o teste de fuso que já existe em
// ProfileTimezoneTest).
class AdherenceStreakTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function markTaken(Profile $profile, $schedule, Carbon $day): void
    {
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $schedule->medication_id,
            'profile_id' => $profile->id,
            'scheduled_at' => $day->copy()->setTimeFromTimeString($schedule->time),
            'taken_at' => $day->copy()->setTimeFromTimeString($schedule->time),
            'status' => 'taken',
        ]);
    }

    private function markMissed(Profile $profile, $schedule, Carbon $day): void
    {
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $schedule->medication_id,
            'profile_id' => $profile->id,
            'scheduled_at' => $day->copy()->setTimeFromTimeString($schedule->time),
            'taken_at' => null,
            'status' => 'missed',
        ]);
    }

    public function test_zero_quando_perfil_nao_tem_schedule_ativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertOk()->assertJson(['current_streak' => 0, 'best_streak' => 0]);
    }

    public function test_conta_dias_consecutivos_com_100_por_cento(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 20:00:00', 'UTC')); // terça

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        $this->markTaken($profile, $schedule, $today);
        $this->markTaken($profile, $schedule, $today->copy()->subDay());
        $this->markTaken($profile, $schedule, $today->copy()->subDays(2));

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertOk()->assertJson(['current_streak' => 3, 'best_streak' => 3]);
    }

    public function test_dia_perdido_quebra_a_sequencia(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 20:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        $this->markTaken($profile, $schedule, $today);
        $this->markTaken($profile, $schedule, $today->copy()->subDay());
        $this->markMissed($profile, $schedule, $today->copy()->subDays(2)); // quebra aqui
        $this->markTaken($profile, $schedule, $today->copy()->subDays(3));

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        // Atual: só hoje + ontem (2), a quebra 2 dias atrás para a contagem.
        $response->assertOk()->assertJson(['current_streak' => 2, 'best_streak' => 2]);
    }

    public function test_dia_sem_horario_previsto_nao_quebra_a_sequencia(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 20:00:00', 'UTC')); // terça (dayOfWeek=2)

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // Só segunda (1) e terça (2) — quarta a domingo é neutro.
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [1, 2]]);

        $today = Carbon::today('UTC'); // terça
        $monday = $today->copy()->subDay();
        $lastTuesday = $today->copy()->subWeek();
        $lastMonday = $lastTuesday->copy()->subDay();

        $this->markTaken($profile, $schedule, $today);
        $this->markTaken($profile, $schedule, $monday);
        $this->markTaken($profile, $schedule, $lastTuesday);
        $this->markTaken($profile, $schedule, $lastMonday);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        // 4 dias "devidos" consecutivos (pulando os 5 dias neutros no meio) = streak 4.
        $response->assertOk()->assertJson(['current_streak' => 4, 'best_streak' => 4]);
    }

    public function test_hoje_pendente_nao_quebra_nem_conta_a_sequencia(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 06:00:00', 'UTC')); // antes das 08h — dose de hoje ainda não passou

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        $this->markTaken($profile, $schedule, $today->copy()->subDay());
        $this->markTaken($profile, $schedule, $today->copy()->subDays(2));
        // Hoje: nenhum log ainda (dose pendente, 08h não chegou).

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertOk()->assertJson(['current_streak' => 2, 'best_streak' => 2]);
    }

    public function test_best_streak_maior_que_atual_apos_quebra_recente(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 20:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        // Sequência atual: só hoje (1 dia).
        $this->markTaken($profile, $schedule, $today);
        // Quebra ontem.
        $this->markMissed($profile, $schedule, $today->copy()->subDay());
        // Sequência antiga maior: 5 dias, de 3 a 7 dias atrás.
        for ($i = 3; $i <= 7; $i++) {
            $this->markTaken($profile, $schedule, $today->copy()->subDays($i));
        }

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertOk()->assertJson(['current_streak' => 1, 'best_streak' => 5]);
    }

    // "Frequência de horário" (2026-08-14) — schedule de intervalo conta
    // todas as ocorrências do dia como "devidas", não uma só; dia só
    // fecha 100% se todas forem tomadas.
    public function test_dia_com_schedule_de_intervalo_so_conta_quando_todas_as_ocorrencias_sao_tomadas(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 23:30:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $today = Carbon::today('UTC');
        // Ontem: as 3 ocorrências (07h, 15h, 23h) tomadas -> dia completo.
        foreach (['07:00:00', '15:00:00', '23:00:00'] as $time) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $today->copy()->subDay()->setTimeFromTimeString($time),
                'taken_at' => $today->copy()->subDay()->setTimeFromTimeString($time),
                'status' => 'taken',
            ]);
        }
        // Hoje: as 3 ocorrências também tomadas -> mais um dia completo,
        // sequência de 2 dias.
        foreach (['07:00:00', '15:00:00', '23:00:00'] as $time) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $today->copy()->setTimeFromTimeString($time),
                'taken_at' => $today->copy()->setTimeFromTimeString($time),
                'status' => 'taken',
            ]);
        }

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertOk()->assertJson(['current_streak' => 2, 'best_streak' => 2]);
    }

    public function test_dia_com_schedule_de_intervalo_parcialmente_tomado_quebra_a_sequencia(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 23:30:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $today = Carbon::today('UTC');
        // Só 2 das 3 ocorrências de hoje tomadas; a 3ª (23h) já passou sem
        // log -> vira "perdida" quando `today()`/check-missed rodar, mas
        // aqui simulamos direto: sem log = quebra (ver doc da Action,
        // "buraco de dado conta como quebra").
        foreach (['07:00:00', '15:00:00'] as $time) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $today->copy()->setTimeFromTimeString($time),
                'taken_at' => $today->copy()->setTimeFromTimeString($time),
                'status' => 'taken',
            ]);
        }
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $today->copy()->setTimeFromTimeString('23:00:00'),
            'taken_at' => null,
            'status' => 'missed',
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertOk()->assertJson(['current_streak' => 0, 'best_streak' => 0]);
    }

    public function test_retorna_403_para_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($intruder)->getJson("/api/profiles/{$profile->id}/streak");

        $response->assertForbidden();
    }

    public function test_store_retorna_milestone_quando_a_acao_completa_7_dias(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 08:05:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        // 6 dias anteriores já completos — hoje, ao ser marcado, fecha o 7º.
        for ($i = 1; $i <= 6; $i++) {
            $this->markTaken($profile, $schedule, $today->copy()->subDays($i));
        }

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $today->copy()->setTimeFromTimeString('08:00:00')->toISOString(),
            'taken_at' => now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $response->assertJson(['streak_milestone' => 7]);
    }

    public function test_store_nao_retorna_milestone_quando_ainda_falta_dose_no_dia(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 08:05:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // Duas doses hoje — marcar só uma não deve completar o dia.
        $schedule1 = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        for ($i = 1; $i <= 6; $i++) {
            $this->markTaken($profile, $schedule1, $today->copy()->subDays($i));
        }

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule1->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $today->copy()->setTimeFromTimeString('08:00:00')->toISOString(),
            'taken_at' => now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $response->assertJson(['streak_milestone' => null]);
    }

    public function test_store_nao_retorna_milestone_quando_streak_nao_bate_numero_redondo(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-11 08:05:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $today = Carbon::today('UTC');
        // Só 2 dias antes + hoje = streak de 3, não é marco.
        for ($i = 1; $i <= 2; $i++) {
            $this->markTaken($profile, $schedule, $today->copy()->subDays($i));
        }

        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $today->copy()->setTimeFromTimeString('08:00:00')->toISOString(),
            'taken_at' => now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $response->assertJson(['streak_milestone' => null]);
    }
}
