<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsultationSummaryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_calcula_percentual_e_lista_doses_perdidas_no_periodo(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // 3 dias devidos: 2 tomados, 1 sem log (conta como perdida)
        foreach ([2, 1] as $daysAgo) {
            DoseLog::create([
                'dose_schedule_id' => $schedule->id,
                'medication_id' => $medication->id,
                'profile_id' => $profile->id,
                'scheduled_at' => Carbon::today('UTC')->subDays($daysAgo)->setTimeFromTimeString('08:00:00'),
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=3");

        $response->assertOk();
        $response->assertJsonPath('due', 3);
        $response->assertJsonPath('taken', 2);
        $response->assertJsonPath('percentage', 67);
        $response->assertJsonCount(1, 'missed');
        $response->assertJsonPath('missed.0.medication_name', 'Losartana');
    }

    public function test_dose_pulada_de_proposito_nao_conta_como_perdida(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today('UTC')->setTimeFromTimeString('08:00:00'),
            'status' => 'skipped',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=1");

        $response->assertOk();
        $response->assertJsonCount(0, 'missed');
    }

    public function test_usuario_gratis_nao_passa_de_30_dias(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=90");

        $response->assertOk();
        $response->assertJsonPath('period_days', 30);
    }

    public function test_usuario_sem_acesso_ao_perfil_recebe_403(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        Sanctum::actingAs($stranger);
        $this->getJson("/api/profiles/{$profile->id}/consultation-summary")->assertForbidden();
    }

    // "PDF respeita o filtro da tela" (2026-09-08, item 16) — achado
    // real do Rilson: o relatório sempre saía fixo (todos os
    // medicamentos), ignorando o filtro por medicamento visível no
    // Histórico.
    public function test_filtra_por_medicamento_quando_medication_id_informado(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $losartana = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $losartanaSchedule = $losartana->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $paracetamol = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Paracetamol']);
        $paracetamolSchedule = $paracetamol->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // Losartana: 1 tomada. Paracetamol: sem log (conta como perdida).
        DoseLog::create([
            'dose_schedule_id' => $losartanaSchedule->id,
            'medication_id' => $losartana->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today('UTC')->setTimeFromTimeString('08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=1&medication_id={$losartana->id}");

        $response->assertOk();
        $response->assertJsonPath('due', 1);
        $response->assertJsonPath('taken', 1);
        $response->assertJsonPath('percentage', 100);
        $response->assertJsonCount(0, 'missed');
    }

    public function test_sem_medication_id_continua_somando_todos_os_medicamentos(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $losartana = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $losartana->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $paracetamol = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Paracetamol']);
        $paracetamol->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=1");

        $response->assertOk();
        $response->assertJsonPath('due', 2);
    }

    // =============================================================
    // P0 (2026-09-25, ROADMAP §9.9): os testes que faltavam.
    //
    // Marcados como `skipped` de propósito — a suíte continua verde
    // enquanto a correção não vem, mas a ASSERÇÃO está escrita e
    // revisada antes de qualquer linha de produção mudar. O P1 é
    // remover o `markTestSkipped` e fazer passar.
    //
    // Todos estes cobrem o pedido do Rilson: o relatório precisa
    // separar, em linguagem clara, "no horário" / "atrasado" / "fora
    // de horário" / "sem registro" / "pulado de propósito" (§8.1).
    // =============================================================

    // §9.2 — o relatório nunca lê `taken_at`. Sem isso o médico recebe
    // "tomado" sem saber quando, e "no horário" e "3h depois" viram a
    // mesma linha. Este teste trava o formato de saída.
    public function test_relatorio_expoe_horario_previsto_e_horario_real_da_dose(): void
    {

        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today('UTC')->setTimeFromTimeString('08:00:00'),
            'taken_at' => Carbon::today('UTC')->setTimeFromTimeString('11:20:00'),
            'status' => 'taken',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=1");

        $response->assertOk();
        $response->assertJsonPath('due', 1);
        $response->assertJsonPath('taken', 1);

        // Os DOIS horários precisam estar no payload, e em rótulos
        // distintos. O médico julga a diferença — o app não rotula
        // "atrasado" (decisão X3, ROADMAP §10.5).
        $this->assertIsArray($response->json('doses'));
        $dose = collect($response->json('doses'))->first();
        $this->assertNotNull($dose['scheduled_at'] ?? null, 'payload precisa expor o horário previsto');
        $this->assertNotNull($dose['taken_at'] ?? null, 'payload precisa expor o horário real');
        $this->assertNotSame(
            $dose['scheduled_at'],
            $dose['taken_at'],
            'tomada às 11:20 de dose prevista para 08:00 não pode sair como mesmo horário'
        );
    }

    // §9.1 — o `orWhereDate` casa qualquer log do mesmo dia e o
    // `first()` sem `orderBy` pega o primeiro. Para `interval_hours`
    // (3 ocorrências/dia) isso faz a ocorrência das 15:00 casar o log
    // das 07:00 → relatório infla `taken` e as perdas reais somem.
    // Este teste é o que torna o bug visível à suíte.
    public function test_relatorio_conta_cada_ocorrencia_de_intervalo_separadamente(): void
    {

        Carbon::setTestNow(Carbon::parse('2026-08-23 23:30:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Metformina']);
        $schedule = $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        // Só a ocorrência das 07:00 foi registrada. As de 15:00 e
        // 23:00 NÃO foram — e é isso que o relatório tem que dizer.
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today('UTC')->setTimeFromTimeString('07:00:00'),
            'taken_at' => Carbon::today('UTC')->setTimeFromTimeString('07:05:00'),
            'status' => 'taken',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=1");

        $response->assertOk();
        $response->assertJsonPath('due', 3, 'a cada 8h num dia = 3 ocorrências previstas');
        $response->assertJsonPath('taken', 1, 'só uma foi registrada — o relatório não pode contar as outras');
        $response->assertJsonCount(2, 'missed', 'as duas não registradas têm que aparecer como perda');
    }

    // §8.3 — a armadilha. "Nunca registrada" e "marcada como perdida
    // pelo cron" são fatos diferentes: a primeira é ausência, a
    // segunda é um veredito do app depois de 24h. O relatório atual
    // funde as duas (`:73-77`).
    public function test_relatorio_separa_sem_registro_de_marcada_como_perdida(): void
    {

        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        // Medicamento A: ocorrência de hoje, sem log nenhum.
        $a = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'SemRegistro']);
        $a->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // Medicamento B: ocorrência de ontem, já marcada 'missed'.
        $b = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'JaMarcada']);
        $bSchedule = $b->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        DoseLog::create([
            'dose_schedule_id' => $bSchedule->id,
            'medication_id' => $b->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::yesterday('UTC')->setTimeFromTimeString('08:00:00'),
            'taken_at' => null,
            'status' => 'missed',
        ]);

        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=2");

        $response->assertOk();

        $missed = collect($response->json('missed'));

        // Com `days=2` são DUAS ocorrências por remédio (ontem e hoje),
        // então a comparação precisa escolher a ocorrência certa — por
        // data — e não agrupar por nome do remédio, senão as duas linhas
        // comparadas viram "a de hoje" e a distinção some por acaso.
        $emOntem = $missed->firstWhere(
            fn ($d) => str_starts_with($d['scheduled_at'], '2026-08-22') && $d['medication_name'] === 'JaMarcada'
        );
        $semRegistro = $missed->firstWhere(
            fn ($d) => str_starts_with($d['scheduled_at'], '2026-08-23') && $d['medication_name'] === 'SemRegistro'
        );

        $this->assertNotNull($semRegistro, 'ocorrência sem log tem que aparecer');
        $this->assertNotNull($emOntem, 'ocorrência de ontem, marcada como perdida, tem que aparecer');

        // As duas entram na lista, cada uma carregando o que a
        // diferencia. Sem isso o médico lê "não tomou" e "não tomou" como
        // o mesmo tipo de evento — e perde a informação de que uma é
        // ausência e a outra é veredito do app depois de 24h.
        $this->assertSame('unrecorded', $semRegistro['state']);
        $this->assertSame('sem registro', $semRegistro['reason']);

        $this->assertSame('marked_missed', $emOntem['state']);
        $this->assertSame('marcada como perdida', $emOntem['reason']);

        $this->assertNotSame(
            $semRegistro['reason'],
            $emOntem['reason'],
            '"sem registro" e "marcada como perdida" precisam de rótulos distintos'
        );
    }

    // §9.5 — `reportHtml.ts:44` imprime "Todas as doses agendadas
    // foram tomadas no período" sempre que `missed` vem vazio,
    // inclusive quando `due === 0` (remédio pausado o mês inteiro).
    // Ou seja: **afirma que tudo foi tomado quando nada estava
    // previsto**. Num documento médico isso é a pior classe de erro.
    public function test_relatorio_nao_declara_tudo_tomado_quando_nada_foi_previsto(): void
    {

        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);

        // Perfil sem nenhum medicamento: due = 0, missed = [].
        Sanctum::actingAs($user);
        $response = $this->getJson("/api/profiles/{$profile->id}/consultation-summary?days=30");

        $response->assertOk();
        $response->assertJsonPath('due', 0);
        $response->assertJsonPath('taken', 0);
        $this->assertNull(
            $response->json('all_taken'),
            'com due = 0 o relatório não pode afirmar que todas as doses foram tomadas'
        );
    }

    // =============================================================
    // P4 (§10.4) — a dose de resgate no relatório do médico.
    //
    // Ela não cabe em nenhum dos dois formatos que o relatório já tinha.
    // Não é "perdida" (ninguém falhou) e não é uma ocorrência (não havia
    // horário previsto), então o loop de ocorrências simplesmente não a
    // geraria: a pessoa TOMOU o remédio e o PDF do médico omite a dose.
    // Este bloco fixa o terceiro caso.
    // =============================================================

    public function test_dose_de_resgate_aparece_no_relatorio_como_tomada_fora_de_horario_previsto(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $resgate = Medication::factory()->create([
            'profile_id' => $profile->id,
            'name' => 'Dipirona',
            'is_prn' => true,
        ]);

        DoseLog::create([
            'dose_schedule_id' => null,
            'client_key' => '00000000-0000-4000-8000-000000000001',
            'medication_id' => $resgate->id,
            'profile_id' => $profile->id,
            'scheduled_at' => null,
            'taken_at' => Carbon::parse('2026-08-22 15:30:00', 'UTC'),
            'status' => 'taken',
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/profiles/' . $profile->id . '/consultation-summary');
        $response->assertOk();
        $summary = $response->json();

        $dose = collect($summary['doses'])->firstWhere('medication_name', 'Dipirona');
        $this->assertNotNull($dose, 'a dose de resgate tem de aparecer no relatório');
        $this->assertSame('recorded', $dose['state'], 'tomada, não perdida');
        $this->assertNull($dose['scheduled_at'], 'a assinatura do terceiro caso: sem horário previsto');
        $this->assertNotNull($dose['taken_at'], 'e com o horário real');
        $this->assertTrue($dose['is_rescue']);

        // D13: entrou no numerador, não no denominador.
        $this->assertSame(0, $summary['due']);
        $this->assertSame(1, $summary['taken']);
        $this->assertSame(1, $summary['rescue']);

        // E, decisivamente, NÃO na lista de perdidas: ninguém falhou.
        $this->assertSame([], $summary['missed']);
    }

    public function test_relatorio_nao_passa_de_100_com_dose_de_resgate(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $previsto = Medication::factory()->create(['profile_id' => $profile->id, 'name' => 'Losartana']);
        $schedule = $previsto->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $resgate = Medication::factory()->create([
            'profile_id' => $profile->id,
            'name' => 'Dipirona',
            'is_prn' => true,
        ]);

        // Ambos HOJE (o relógio de teste é 23/08 12:00) e ambos já
        // passados: 09:00 de resgate está antes das 12:00, senão a
        // guarda "ainda não aconteceu" o excluiria e o teste passaria
        // pelo motivo errado.
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $previsto->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::parse('2026-08-23 08:00:00', 'UTC'),
            'taken_at' => Carbon::parse('2026-08-23 08:00:00', 'UTC'),
            'status' => 'taken',
        ]);
        DoseLog::create([
            'dose_schedule_id' => null,
            'client_key' => '00000000-0000-4000-8000-000000000002',
            'medication_id' => $resgate->id,
            'profile_id' => $profile->id,
            'scheduled_at' => null,
            'taken_at' => Carbon::parse('2026-08-23 09:00:00', 'UTC'),
            'status' => 'taken',
        ]);

        Sanctum::actingAs($user);

        // `days=1` é essencial aqui: com o período padrão de 30 dias e
        // um remédio diário, `due` seria 30 e a razão ficaria em 7% —
        // o teste passaria sem nunca exercitar o teto.
        $summary = $this->getJson('/api/profiles/' . $profile->id . '/consultation-summary?days=1')->json();

        $this->assertSame(1, $summary['due']);
        $this->assertSame(2, $summary['taken']);
        $this->assertSame(100, $summary['percentage'], '"200% de adesão" é falso — 100% é o teto');
    }

    // Uma dose de resgate no FUTURO não entra como tomada. É a mesma lei
    // das ocorrências ("ainda não chegou, não conta"), e sem ela o
    // relatório de hoje contaria uma dose que a pessoa ainda não
    // poderia ter tomado.
    public function test_dose_de_resgate_no_futuro_nao_conta(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-23 12:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $resgate = Medication::factory()->create([
            'profile_id' => $profile->id,
            'name' => 'Dipirona',
            'is_prn' => true,
        ]);

        DoseLog::create([
            'dose_schedule_id' => null,
            'client_key' => '00000000-0000-4000-8000-000000000003',
            'medication_id' => $resgate->id,
            'profile_id' => $profile->id,
            'scheduled_at' => null,
            'taken_at' => Carbon::parse('2026-08-25 15:30:00', 'UTC'),
            'status' => 'taken',
        ]);

        Sanctum::actingAs($user);

        $summary = $this->getJson('/api/profiles/' . $profile->id . '/consultation-summary')->json();

        $this->assertSame(0, $summary['taken']);
        $this->assertNull(collect($summary['doses'])->firstWhere('medication_name', 'Dipirona'));
    }
}
