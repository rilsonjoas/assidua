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

    // Os testes de P2 congelam o relógio para provar a fronteira
    // "vencida vs. ainda não chegou". Sem este `tearDown`, o tempo
    // congelado **vaza para os outros arquivos** do processo e o
    // sintoma aparece longe da causa — que é a receita de um flaky que
    // ninguém acha.
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

    public function test_nulo_quando_perfil_sem_schedule_ativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));

        // `rescue` entrou no contrato no P4/D13: é ele que explica de
        // onde vêm as doses a mais no numerador. Zero aqui — nenhuma
        // dose de resgate no dia.
        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null, 'rescue' => 0], $result);
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

        // `rescue` entrou no contrato no P4/D13: é ele que explica de
        // onde vêm as doses a mais no numerador. Zero aqui — nenhuma
        // dose de resgate no dia.
        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null, 'rescue' => 0], $result);
    }

    public function test_medicamento_pausado_nao_entra_na_conta(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_paused' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));

        // `rescue` entrou no contrato no P4/D13: é ele que explica de
        // onde vêm as doses a mais no numerador. Zero aqui — nenhuma
        // dose de resgate no dia.
        $this->assertSame(['taken' => 0, 'due' => 0, 'percentage' => null, 'rescue' => 0], $result);
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

    // ══ P2 (2026-09-25): dose que AINDA NÃO CHEGOU não é devida ══
    //
    // Esta é a mesma lei de `GenerateConsultationSummary` e a mesma que o
    // anel da Home passou a usar no 9.5a. Sem ela, o calendário e o anel
    // discordavam: às 08:00 com 3 doses no dia e nenhuma tomada, o anel
    // dizia "0 de 1" e o calendário dizia **0% em vermelho** com 3 no
    // denominador. Dois valores de adesão na mesma tela, e o calendário
    // errado.

    public function test_ocorrencia_futura_nao_conta_no_denominador(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 08:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => true]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null, 'is_active' => true]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-07-15', 'UTC'));

        // São 08:00: a dose das 08:00 venceu (e conta), a das 20:00 não.
        $this->assertSame(1, $result['due'], 'A dose das 20:00 ainda não chegou.');
        $this->assertSame(0, $result['taken']);
        $this->assertSame(0, $result['percentage']);
    }

    public function test_nenhuma_ocorrencia_vencida_devolve_null_e_nao_zero(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 07:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => true]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-07-15', 'UTC'));

        // `percentage: null` e não 0: às 07:00 o dia não está "em 0%",
        // está em aberto. É a distinção que o 9.5a trouxe para o anel.
        $this->assertSame(0, $result['due']);
        $this->assertNull($result['percentage'], 'Nada venceu ainda: afirmar 0% seria juizo sobre um dia que nao comecou.');
    }

    public function test_ocorrencia_que_acabou_de_vencer_conta(): void
    {
        // A fronteira: 1 minuto depois do horário, a dose JÁ é devida.
        Carbon::setTestNow(Carbon::parse('2026-07-15 08:01:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => true]);

        $result = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-07-15', 'UTC'));

        $this->assertSame(1, $result['due'], 'Passado o horário, a dose é devida — sem esperar os 30 min do "Atrasado".');
    }

    // =============================================================
    // P4 / D13 — a dose de resgate (PRN) na adesão.
    //
    // A regra: entra no NUMERADOR, nunca no DENOMINADOR. Quem tomou o
    // remédio certo tem isso reconhecido; e o PRN nunca vira "devida",
    // porque não tinha horário previsto para dever.
    //
    // Estes testes existem porque oContrary é sutil: a versão anterior
    // simplesmente ignorava a PRN, e "ignorar" parece innocuous — até
    // alguém reparar que o dia mostrava adesão de quem fez tudo, menor
    // do que a real, e 0% para quem só usa resgate.
    // =============================================================

    /**
     * UUID v4 determinístico a partir de um inteiro.
     *
     * Existe porque o `client_key` é coluna `uuid` NATIVA no PostgreSQL
     * (produção), e o SQLite aceita qualquer texto. Com a chave
     * `'key-' . $i` a suíte passava no SQLite e estourava no Postgres —
     * ou seja, ela não estava provando o contrato que a produção exige.
     */
    private static function uuidFor(int $n): string
    {
        $h = sprintf('%032x', $n);

        return substr($h, 0, 8).'-'.substr($h, 8, 4).'-4'.substr($h, 13, 3)
            .'-8'.substr($h, 17, 3).'-'.substr($h, 20, 12);
    }

    private function markRescueTaken(Profile $profile, Medication $medication, Carbon $takenAt, string $key): void
    {
        DoseLog::create([
            'dose_schedule_id' => null,
            'client_key' => $key,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => null,
            'taken_at' => $takenAt,
            'status' => 'taken',
        ]);
    }

    public function test_dose_de_resgate_entra_no_numerador_mas_nao_no_denominador(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);
        $previsto = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $previsto->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $day = Carbon::parse('2026-09-02', 'UTC');
        $this->markTaken($profile, $schedule, $day);
        $this->markRescueTaken($profile, $medication, $day->copy()->setTimeFromTimeString('15:00:00'), '00000000-0000-4000-8000-000000000001');

        $result = app(CalculateDailyAdherence::class)->handle($profile, $day);

        // O denominador é 1: só havia UMA dose prevista. A de resgate
        // não soma aqui — foi isso que o teste de "não soma" lá embaixo
        // fixa.
        $this->assertSame(1, $result['due'], 'a dose de resgate não pode virar dose devida');
        // O numerador é 2: a prevista + a de resgate.
        $this->assertSame(2, $result['taken'], 'a dose de resgate tem de contar como tomada');
        $this->assertSame(1, $result['rescue']);
    }

    // O teto de 100%. Sem ele, 1 prevista + 1 resgate daria "200% de
    // adesão" — e isso é falso: adesão mede o quanto do PLANEJADO foi
    // cumprido. As contas não são cortadas, só a leitura percentual.
    public function test_percentual_nao_passa_de_100_com_doses_de_resgate(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $previsto = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $previsto->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $resgate = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);

        $day = Carbon::parse('2026-09-02', 'UTC');
        $this->markTaken($profile, $schedule, $day);
        $this->markRescueTaken($profile, $resgate, $day->copy()->setTimeFromTimeString('15:00:00'), '00000000-0000-4000-8000-000000000002');

        $result = app(CalculateDailyAdherence::class)->handle($profile, $day);

        $this->assertSame(100, $result['percentage']);
        // As contas ficam íntegras, e `rescue` explica a diferença — sem
        // ele, "tomadas 2, devidas 1, 100%" parece bug.
        $this->assertSame(2, $result['taken']);
        $this->assertSame(1, $result['due']);
        $this->assertSame(1, $result['rescue']);
    }

    public function test_doses_de_resgate_nao_alteram_o_denominador(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);

        $day = Carbon::parse('2026-09-02', 'UTC');
        for ($i = 0; $i < 5; $i++) {
            $this->markRescueTaken($profile, $medication, $day->copy()->setTimeFromTimeString('0' . $i . ':00:00'), self::uuidFor($i));
        }

        $result = app(CalculateDailyAdherence::class)->handle($profile, $day);

        $this->assertSame(0, $result['due'], 'nenhuma dose de resgate é devida');
        $this->assertSame(5, $result['taken']);
        $this->assertSame(5, $result['rescue']);
        // Sem doses previstas, não há divisão possível — e o app diz
        // "sem doses previstas" em vez de 0%.
        $this->assertNull($result['percentage']);
    }

    // Quem só usa resgate não tem schedule nenhum. A versão anterior
    // parava antes de contar, e o dia aparecia como "não aconteceu
    // nada" — o registro de um dia em que a pessoa TOMOU o remédio.
    public function test_perfil_so_com_remedio_de_resgate_nao_reporta_dia_vazio(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);

        $day = Carbon::parse('2026-09-02', 'UTC');
        $this->markRescueTaken($profile, $medication, $day->copy()->setTimeFromTimeString('09:00:00'), '00000000-0000-4000-8000-000000000003');

        $result = app(CalculateDailyAdherence::class)->handle($profile, $day);

        $this->assertSame(1, $result['taken']);
        $this->assertSame(0, $result['due']);
        $this->assertSame(1, $result['rescue']);
        $this->assertNull($result['percentage']);
    }

    // A dose de resgate conta no dia em que foi TOMADA, não no dia
    // "previsto" (que não existe). É o mesmo dia que o Histórico usa
    // (`dayOfDose`), e se divergissem o mesmo registro contaria em
    // dias diferentes.
    public function test_dose_de_resgate_conta_no_dia_em_que_foi_tomada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);

        $tomada = Carbon::parse('2026-09-02 23:50:00', 'UTC');
        $this->markRescueTaken($profile, $medication, $tomada, '00000000-0000-4000-8000-000000000004');

        $doDia = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-02', 'UTC'));
        $doDiaSeguinte = app(CalculateDailyAdherence::class)->handle($profile, Carbon::parse('2026-09-03', 'UTC'));

        $this->assertSame(1, $doDia['taken'], 'conta no dia em que foi tomada');
        $this->assertSame(0, $doDiaSeguinte['taken'], 'e não no dia seguinte');
    }
}
