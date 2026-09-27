<?php

namespace Tests\Feature;

use App\Actions\DeriveDoseOccurrences;
use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P2 / §10.2 — o cache da derivação por ocorrência.
 *
 * O que está em teste aqui não é performance, é **correção**: o cache
 * guarda a ocorrência derivada do *horário*, e o estado vem do log,
 * aplicado depois. Se alguém mexer nisso, dois bugs reaparecem — e
 * nenhum deles é óbvio olhando o código:
 *
 *   1. cachear o estado junto → gravar um log não invalida nada, e o
 *      Histórico continua dizendo "sem registro" para uma dose já tomada;
 *   2. aplicar o filtro "já venceu" antes do cache → o cache de hoje
 *      fica incompleto de manhã e serve lista envelhecida à noite.
 */
class DeriveDoseOccurrencesTest extends TestCase
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

    private function profileComHorario(string $time = '08:00:00'): array
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $schedule = $medication->schedules()->create([
            'time' => $time,
            'days_of_week' => null,
            'is_active' => true,
        ]);

        return [$user, $profile, $medication, $schedule];
    }

    public function test_deriva_dose_do_dia_com_estado_unrecorded(): void
    {
        [, $profile, , $schedule] = $this->profileComHorario();

        $rows = app(DeriveDoseOccurrences::class)->handle(
            $profile,
            Carbon::parse('2026-07-15', 'UTC'),
            Carbon::parse('2026-07-15', 'UTC'),
        );

        $this->assertCount(1, $rows);
        $this->assertSame(DeriveDoseOccurrences::STATE_UNRECORDED, $rows[0]['state']);
        $this->assertSame($schedule->id, $rows[0]['dose_schedule_id']);
    }

    public function test_nao_inclui_dose_que_ainda_nao_chegou(): void
    {
        [, $profile] = $this->profileComHorario('20:00:00');

        $rows = app(DeriveDoseOccurrences::class)->handle(
            $profile,
            Carbon::parse('2026-07-15', 'UTC'),
            Carbon::parse('2026-07-15', 'UTC'),
        );

        // São 12:00 e a dose é das 20:00.
        $this->assertCount(0, $rows);
    }

    // ── o que o cache NÃO pode fazer ──────────────────────────────────

    public function test_gravar_log_nao_requer_invalidação_para_o_estado_mudar(): void
    {
        [, $profile, $medication, $schedule] = $this->profileComHorario();
        $action = app(DeriveDoseOccurrences::class);

        $antes = $action->handle($profile, Carbon::parse('2026-07-15', 'UTC'), Carbon::parse('2026-07-15', 'UTC'));
        $this->assertSame(DeriveDoseOccurrences::STATE_UNRECORDED, $antes[0]['state']);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 08:05:00',
            'status' => 'taken',
        ]);

        // **Sem** chamar `Cache::forget` e **sem** bump de geração. Se o
        // cache guardasse estado, esta asserção falharia — e é esse o
        // ponto: o estado tem de vir do log, não do cache.
        $depois = $action->handle($profile, Carbon::parse('2026-07-15', 'UTC'), Carbon::parse('2026-07-15', 'UTC'));
        $this->assertSame(DeriveDoseOccurrences::STATE_RECORDED, $depois[0]['state']);
        $this->assertNotNull($depois[0]['taken_at']);
    }

    public function test_dose_registrada_nao_duplica_occurrence_e_log(): void
    {
        [, $profile, $medication, $schedule] = $this->profileComHorario();
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'status' => 'taken',
        ]);

        $rows = app(DeriveDoseOccurrences::class)->handle(
            $profile,
            Carbon::parse('2026-07-15', 'UTC'),
            Carbon::parse('2026-07-15', 'UTC'),
        );

        $this->assertCount(1, $rows, 'Ocorrência e log descrevem a mesma dose: uma linha só.');
    }

    // ── o que o cache PRECISA invalidar ─────────────────────────────

    public function test_mudar_o_generation_invalida_o_dia_anterior(): void
    {
        [, $profile, , $schedule] = $this->profileComHorario('08:00:00');
        $action = app(DeriveDoseOccurrences::class);

        $antes = $action->handle($profile, Carbon::parse('2026-07-15', 'UTC'), Carbon::parse('2026-07-15', 'UTC'));
        $this->assertCount(1, $antes);

        // muda o horário: 08:00 → 09:00
        $schedule->update(['time' => '09:00:00']);
        $profile->bumpOccurrenceGeneration();
        $profile->refresh();

        $depois = $action->handle($profile, Carbon::parse('2026-07-15', 'UTC'), Carbon::parse('2026-07-15', 'UTC'));

        $this->assertCount(1, $depois);
        $this->assertStringContainsString(
            '09:00',
            $depois[0]['scheduled_at'],
            'Sem bump de geração, o cache serviria a ocorrência das 08:00 — pior do que não cachear.'
        );
    }

    public function test_mudanca_de_horario_sem_bump_serve_dado_velho(): void
    {
        // Este teste documenta **por que** o bump existe: é o comportamento
        // que acontece se alguém esquecer de chamar. Não é o que queremos —
        // é o que precisamos enxergar.
        [, $profile, , $schedule] = $this->profileComHorario('08:00:00');
        $action = app(DeriveDoseOccurrences::class);

        $action->handle($profile, Carbon::parse('2026-07-15', 'UTC'), Carbon::parse('2026-07-15', 'UTC'));

        $schedule->update(['time' => '09:00:00']);
        // SEM bump — proposital.

        $depois = $action->handle($profile, Carbon::parse('2026-07-15', 'UTC'), Carbon::parse('2026-07-15', 'UTC'));
        $this->assertStringContainsString('08:00', $depois[0]['scheduled_at']);
    }

    public function test_periodo_multiplos_dias_devolve_ocorrencias_de_todos(): void
    {
        [, $profile] = $this->profileComHorario('08:00:00');

        $rows = app(DeriveDoseOccurrences::class)->handle(
            $profile,
            Carbon::parse('2026-07-13', 'UTC'),
            Carbon::parse('2026-07-15', 'UTC'),
        );

        $this->assertCount(3, $rows, '13, 14 e 15 — um por dia.');
    }

    public function test_filtra_por_medicamento(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $a = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $b = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $a->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => true]);
        $b->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => true]);

        $rows = app(DeriveDoseOccurrences::class)->handle(
            $profile,
            Carbon::parse('2026-07-15', 'UTC'),
            Carbon::parse('2026-07-15', 'UTC'),
            $a->id,
        );

        $this->assertCount(1, $rows);
        $this->assertSame($a->id, $rows[0]['medication_id']);
    }
}
