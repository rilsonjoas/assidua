<?php

namespace Tests\Feature;

use App\Actions\CalculateDailyAdherence;
use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// "Calendário de adesão" (v1.3, aprovado 2026-09-02) — extraído de
// CalculateWeeklyAdherence, ver CalculateWeeklyAdherenceTest pra
// confirmar que a semana continua batendo os mesmos números de antes
// da extração.
class CalculateDailyAdherenceTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_nulo_quando_perfil_sem_schedule_ativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));

        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null], $result);
    }

    public function test_dia_sem_nenhuma_dose_marcada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));

        $this->assertSame(1, $result['due']);
        $this->assertSame(0, $result['taken']);
        $this->assertSame(0, $result['percentage']);
    }

    public function test_dia_com_todas_as_doses_tomadas_da_100_por_cento(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $day = Carbon::parse('2026-09-02', 'UTC');
        $this->markTaken($profile, $schedule, $day);

        $result = app(CalculateDailyAdherence::class)->handle($profile, $day);

        $this->assertSame(1, $result['due']);
        $this->assertSame(1, $result['taken']);
        $this->assertSame(100, $result['percentage']);
    }

    // Mesmo ajuste de "Frequência de horário" (2026-08-14) usado em
    // CalculateWeeklyAdherence — "devido" conta ocorrências, não
    // schedules.
    public function test_schedule_de_intervalo_conta_todas_as_ocorrencias_do_dia(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $day = Carbon::parse('2026-09-02', 'UTC');
        foreach (['07:00:00', '15:00:00'] as $time) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $day->copy()->setTimeFromTimeString($time),
                'taken_at' => $day->copy()->setTimeFromTimeString($time),
                'status' => 'taken',
            ]);
        }
        // A ocorrência das 23h fica sem log — perdida/pendente.

        $result = app(CalculateDailyAdherence::class)->handle($profile, $day);

        $this->assertSame(3, $result['due']);
        $this->assertSame(2, $result['taken']);
        $this->assertSame(67, $result['percentage']); // round(2/3*100)
    }

    public function test_dia_sem_schedule_previsto_naquele_dia_da_semana_da_devido_zero(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // Só terça (2). 2026-09-02 é uma quarta-feira (3).
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [2]]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));

        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null], $result);
    }

    public function test_medicamento_pausado_nao_entra_na_conta(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));

        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null], $result);
    }

    // Reaproveitar a coleção de schedules já buscada (passada por quem
    // itera vários dias) precisa dar o mesmo resultado de buscar sozinho.
    public function test_aceita_schedules_ja_carregados_sem_buscar_de_novo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $day = Carbon::parse('2026-09-02', 'UTC');
        $this->markTaken($profile, $schedule, $day);

        $preloaded = $medication->schedules()->get(['id', 'time', 'days_of_week', 'interval_hours']);
        $result = app(CalculateDailyAdherence::class)->handle($profile, $day, $preloaded);

        $this->assertSame(1, $result['due']);
        $this->assertSame(1, $result['taken']);
        $this->assertSame(100, $result['percentage']);
    }
}
