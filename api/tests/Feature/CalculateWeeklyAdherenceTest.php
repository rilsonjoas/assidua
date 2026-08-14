<?php

namespace Tests\Feature;

use App\Actions\CalculateWeeklyAdherence;
use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalculateWeeklyAdherenceTest extends TestCase
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

        $result = app(CalculateWeeklyAdherence::class)->handle($profile, Carbon::parse('2026-08-16', 'UTC'));

        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null], $result);
    }

    public function test_calcula_percentual_dos_ultimos_7_dias(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $end = Carbon::parse('2026-08-16', 'UTC'); // domingo — janela: 10 a 16/08
        // 5 das 7 doses previstas tomadas.
        foreach ([0, 1, 2, 3, 4] as $daysAgo) {
            $this->markTaken($profile, $schedule, $end->copy()->subDays($daysAgo));
        }
        // os outros 2 dias (5 e 6 dias atrás) ficam sem log — perdidos/pendentes, não contam como tomados.

        $result = app(CalculateWeeklyAdherence::class)->handle($profile, $end);

        $this->assertSame(7, $result['due']);
        $this->assertSame(5, $result['taken']);
        $this->assertSame(71, $result['percentage']); // round(5/7*100)
    }

    public function test_dia_sem_schedule_previsto_nao_conta_no_total_devido(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // Só domingo (0) e segunda (1).
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [0, 1]]);

        $end = Carbon::parse('2026-08-16', 'UTC'); // domingo
        $this->markTaken($profile, $schedule, $end); // domingo tomado
        $this->markTaken($profile, $schedule, $end->copy()->subDays(6)); // segunda anterior tomada

        $result = app(CalculateWeeklyAdherence::class)->handle($profile, $end);

        // Só 2 dias devidos na janela de 7 dias (dom + seg), ambos tomados.
        $this->assertSame(2, $result['due']);
        $this->assertSame(2, $result['taken']);
        $this->assertSame(100, $result['percentage']);
    }

    // "Frequência de horário" (2026-08-14) — schedule de intervalo conta
    // várias doses devidas por dia, não uma só.
    public function test_schedule_de_intervalo_conta_todas_as_ocorrencias_como_devidas(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $end = Carbon::parse('2026-08-16', 'UTC');
        // Só o dia de hoje (3 ocorrências: 07h, 15h, 23h) tomado por completo.
        foreach (['07:00:00', '15:00:00', '23:00:00'] as $time) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => $end->copy()->setTimeFromTimeString($time),
                'taken_at' => $end->copy()->setTimeFromTimeString($time),
                'status' => 'taken',
            ]);
        }

        $result = app(CalculateWeeklyAdherence::class)->handle($profile, $end);

        // 7 dias * 3 ocorrências = 21 devidas; só as 3 de hoje tomadas.
        $this->assertSame(21, $result['due']);
        $this->assertSame(3, $result['taken']);
        $this->assertSame(14, $result['percentage']); // round(3/21*100)
    }

    public function test_medicamento_pausado_nao_entra_na_conta(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $result = app(CalculateWeeklyAdherence::class)->handle($profile, Carbon::parse('2026-08-16', 'UTC'));

        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null], $result);
    }
}
