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

    // "Dose fora do horário + recálculo" (item 8, 2026-09-08) — achado
    // real do Rilson: tomar o remédio de intervalo bem fora do previsto
    // deveria poder deslocar as doses restantes DAQUELE DIA, sem virar
    // o horário permanente.
    public function test_override_de_hoje_desloca_a_ancora_so_no_dia_salvo(): void
    {
        $today = Carbon::parse('2026-08-14');
        $schedule = new DoseSchedule([
            'time' => '08:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
            'today_override_date' => $today->copy(),
            'today_override_time' => '10:00:00',
        ]);

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $today);

        // Só 18h, NÃO 10h — achado real de revisão de código (2026-09-08):
        // a própria âncora do override É o horário que a pessoa acabou de
        // registrar como tomado (foi esse `taken_at` que gerou a oferta
        // de recalcular). Gerar de novo uma ocorrência ali orfanaria o
        // DoseLog recém-criado e criaria uma dose "perdida" fantasma pra
        // uma dose já tomada. Recalcular é sempre "a partir de agora",
        // não "esse instante também conta como uma dose nova".
        $this->assertSame(['18:00:00'], array_map(fn ($c) => $c->format('H:i:s'), $occurrences));
    }

    public function test_override_de_hoje_nao_orfana_a_dose_que_disparou_o_recalculo(): void
    {
        // Mesmo cenário do teste acima, mas nomeando explicitamente a
        // garantia que importa: um DoseLog com scheduled_at=08:00 (o
        // horário original, já registrado como tomado às 10h) continua
        // sendo "a dose das 08h" pro resto do sistema — ele não pode
        // sumir da lista de ocorrências de hoje só porque a âncora
        // mudou. GenerateScheduleOccurrences não sabe de DoseLog
        // diretamente; a garantia aqui é a mais fraca (e suficiente):
        // 08:00 nunca aparece de novo na lista após o recálculo, então
        // nenhum código que casa por scheduled_at exato vai tentar criar
        // uma segunda entrada pra esse mesmo horário.
        $schedule = new DoseSchedule([
            'time' => '08:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
            'today_override_date' => Carbon::parse('2026-08-14'),
            'today_override_time' => '10:00:00',
        ]);

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, Carbon::parse('2026-08-14'));

        $this->assertNotContains('08:00:00', array_map(fn ($c) => $c->format('H:i:s'), $occurrences));
        $this->assertNotContains('10:00:00', array_map(fn ($c) => $c->format('H:i:s'), $occurrences));
    }

    public function test_override_de_hoje_nao_vaza_pro_dia_seguinte(): void
    {
        $schedule = new DoseSchedule([
            'time' => '08:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
            'today_override_date' => Carbon::parse('2026-08-14'),
            'today_override_time' => '10:00:00',
        ]);
        $tomorrow = Carbon::parse('2026-08-15');

        $occurrences = (new GenerateScheduleOccurrences)->handle($schedule, $tomorrow);

        // Volta sozinho pra âncora permanente (08h) — override "expirou".
        $this->assertSame('08:00:00', $occurrences[0]->format('H:i:s'));
    }
}
