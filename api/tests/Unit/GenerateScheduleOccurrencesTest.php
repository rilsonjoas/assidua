<?php

namespace Tests\Unit;

use App\Actions\GenerateScheduleOccurrences;
use App\Models\DoseSchedule;
use Carbon\Carbon;
use Tests\TestCase;

class GenerateScheduleOccurrencesTest extends TestCase
{
    public function test_horario_fixo_sem_intervalo_gera_uma_ocorrencia(): void
    {
        $schedule = new DoseSchedule(['time' => '08:00:00', 'days_of_week' => null, 'interval_hours' => null]);
        $date = Carbon::parse('2026-08-14');

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $date);

        $this->assertCount(1, $occurrences);
        $this->assertSame('2026-08-14 08:00:00', $occurrences[0]->format('Y-m-d H:i:s'));
    }

    public function test_horario_fixo_fora_do_dia_da_semana_nao_gera_ocorrencia(): void
    {
        $schedule = new DoseSchedule(['time' => '08:00:00', 'days_of_week' => [1, 3, 5], 'interval_hours' => null]);
        $sunday = Carbon::parse('2026-08-16'); // domingo

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $sunday);

        $this->assertCount(0, $occurrences);
    }

    public function test_intervalo_de_8_horas_a_partir_das_07h_gera_3_ocorrencias(): void
    {
        $schedule = new DoseSchedule(['time' => '07:00:00', 'days_of_week' => null, 'interval_hours' => 8]);
        $date = Carbon::parse('2026-08-14');

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $date);

        $this->assertCount(3, $occurrences);
        $this->assertSame(['07:00:00', '15:00:00', '23:00:00'], array_map(fn ($c) => $c->format('H:i:s'), $occurrences));
    }

    public function test_intervalo_ignora_days_of_week_de_proposito(): void
    {
        // Remédio de curso contínuo — mesmo com days_of_week setado (lixo
        // de uma edição anterior, por exemplo), intervalo sempre vale
        // todo dia.
        $schedule = new DoseSchedule(['time' => '06:00:00', 'days_of_week' => [1], 'interval_hours' => 12]);
        $sunday = Carbon::parse('2026-08-16');

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $sunday);

        $this->assertCount(2, $occurrences);
    }

    public function test_intervalo_nao_vaza_ocorrencia_pro_dia_seguinte(): void
    {
        // 10 em 10 horas a partir das 20h: 20h, 06h (dia seguinte, não
        // deve entrar), então só 1 ocorrência neste dia.
        $schedule = new DoseSchedule(['time' => '20:00:00', 'days_of_week' => null, 'interval_hours' => 10]);
        $date = Carbon::parse('2026-08-14');

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $date);

        $this->assertCount(1, $occurrences);
        $this->assertSame('20:00:00', $occurrences[0]->format('H:i:s'));
    }

    public function test_intervalo_de_1_hora_gera_24_ocorrencias(): void
    {
        $schedule = new DoseSchedule(['time' => '00:00:00', 'days_of_week' => null, 'interval_hours' => 1]);
        $date = Carbon::parse('2026-08-14');

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $date);

        $this->assertCount(24, $occurrences);
    }
}
