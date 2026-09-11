<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogTodayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Congela em uma quarta-feira (dayOfWeek = 3) para os testes de days_of_week serem determinísticos.
        // Carbon::parse sem tz explícito usa o default da app (UTC) — por
        // isso todo perfil aqui é criado com timezone 'UTC' (2026-08-10):
        // esta suíte testa a lógica de status de dose, não fuso horário
        // (isso tem teste dedicado em ProfileTimezoneTest), então trava o
        // perfil em UTC pra manter "hora congelada" == "hora local" como
        // o resto do arquivo sempre assumiu.
        Carbon::setTestNow(Carbon::parse('2026-07-15 00:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_lista_dose_pendente_para_schedule_sem_restricao_de_dias(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment([
            'status' => 'pending',
            'dose_schedule_id' => $schedule->id,
            // Sufixo HHmm (2026-08-14) — evita colisão de id entre
            // ocorrências do mesmo schedule no dia (frequência de horário).
            'id' => "pending_{$schedule->id}_0800",
        ]);
    }

    public function test_exclui_schedule_cujo_dia_da_semana_nao_e_hoje(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // hoje é quarta (3); agenda só para segunda (1)
        $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => [1],
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_inclui_schedule_cujo_dia_da_semana_e_hoje(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => [3], // quarta
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['dose_schedule_id' => $schedule->id]);
    }

    public function test_reflete_log_ja_registrado_para_hoje(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
        ]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00'),
            'taken_at' => Carbon::now(),
            'status' => 'taken',
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment([
            'id' => $log->id,
            'status' => 'taken',
        ]);
    }

    public function test_ignora_medicamento_inativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_ignora_schedule_inativo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => false]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(0);
    }

    public function test_retorna_403_para_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id, 'timezone' => 'UTC']);

        $response = $this->actingAs($intruder)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertForbidden();
    }

    // Tolerância de 24h (2026-09-11, entrevista de decisões de horário —
    // ver ROADMAP.md): antes desta mudança, abrir "Hoje" já marcava
    // "missed" na hora pra qualquer dose atrasada. Como este endpoint só
    // olha ocorrências de HOJE (nunca de ontem), e um dia tem no máximo
    // ~24h, uma ocorrência de hoje NUNCA consegue ficar 24h+ atrasada
    // enquanto ainda é hoje — na prática, este endpoint deixou de marcar
    // "missed" sozinho (quem faz isso agora é o cron `CheckMissedDoses`,
    // que olha ontem+hoje). Dentro da tolerância, a dose continua
    // "pending" no backend — "Atrasado" é 100% visual, calculado no app.
    public function test_dose_atrasada_dentro_da_tolerancia_continua_pending_via_endpoint_hoje(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00')); // 2h de atraso

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['status' => 'pending']);
        $this->assertSame(0, DoseLog::count());
    }

    // Prova o limite: mesmo bem tarde no MESMO dia (23:59), uma
    // ocorrência de hoje segue sem completar 24h de atraso — este
    // endpoint genuinamente não marca "missed" sozinho nunca mais
    // (fica sempre a cargo do cron, que olha o dia anterior também).
    public function test_dose_de_hoje_nunca_vira_missed_via_endpoint_hoje_mesmo_bem_tarde(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 23:59:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '00:01:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonFragment(['status' => 'pending']);
        $this->assertSame(0, DoseLog::count());
    }

    public function test_dose_perdida_continua_com_horario_futuro_como_pendente(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create([
            'time' => '20:00:00', // ainda não chegou às 10h
            'days_of_week' => null,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(1);
        $response->assertJsonFragment(['status' => 'pending']);
    }

    // Cenário real: a dose já passou de 24h (o cron `CheckMissedDoses`
    // já teria marcado "missed" antes deste teste rodar — simulado aqui
    // direto no banco, já que este endpoint sozinho não faz mais esse
    // flip, ver testes acima) e a pessoa ainda assim marca como tomada.
    public function test_dose_perdida_ainda_pode_ser_marcada_como_tomada_depois(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'status' => 'missed',
        ]);

        // Usuário percebe e marca como tomada mesmo assim, atrasada.
        $response = $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::today()->setTimeFromTimeString('08:00:00')->toISOString(),
            'taken_at' => Carbon::now()->toISOString(),
            'status' => 'taken',
        ]);

        $response->assertCreated();
        $this->assertSame(1, DoseLog::where('dose_schedule_id', $schedule->id)->count());
        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'taken']);
    }

    public function test_ordena_doses_por_horario(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk();
        $times = collect($response->json())->pluck('scheduled_at');
        $this->assertTrue($times->first() < $times->last());
    }

    // "Frequência de horário" (2026-08-14) — decisão de produto confirmada:
    // vale o esforço de um intervalo de verdade em vez de só sugerir
    // cadastrar 3 horários fixos manualmente.
    public function test_schedule_de_intervalo_gera_uma_dose_por_ocorrencia_do_dia(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // "hoje" congelado em 00:00 no setUp — 07h/15h/23h ficam todas no
        // futuro, então as 3 continuam pendentes (sem viraram "perdida").
        $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(3);
        $times = collect($response->json())->pluck('scheduled_at')->map(fn ($t) => substr($t, 11, 5));
        $this->assertSame(['07:00', '15:00', '23:00'], $times->all());
    }

    // Tolerância de 24h (2026-09-11) — revisa o teste original: mesmo
    // com 07h e 15h já passadas das 16h "agora", nenhuma das duas chega
    // a 24h de atraso NO MESMO DIA (impossível, um dia só tem ~24h) —
    // todas as 3 ocorrências continuam "pending" no backend. "Atrasado"
    // pras 2 primeiras é responsabilidade só do app, calculado do
    // `scheduled_at`, sem gravar nada aqui.
    public function test_schedule_de_intervalo_mantem_ocorrencias_passadas_pending_dentro_da_tolerancia(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 16:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk()->assertJsonCount(3);
        $byTime = collect($response->json())->keyBy(fn ($d) => substr($d['scheduled_at'], 11, 5));
        $this->assertSame('pending', $byTime['07:00']['status']);
        $this->assertSame('pending', $byTime['15:00']['status']);
        $this->assertSame('pending', $byTime['23:00']['status']);
        $this->assertSame(0, DoseLog::count());
    }

    // "Dose fora do horário + recálculo" (item 8, 2026-09-08) — achado
    // real de revisão de código: recalcular o dia depois de registrar
    // uma dose atrasada criava uma dose "perdida" fantasma no horário
    // que a pessoa ACABOU de registrar como tomada, porque a ocorrência
    // recalculada batia em cima da própria âncora do recálculo, sem
    // achar o DoseLog (que continua com o `scheduled_at` original).
    public function test_recalcular_apos_dose_atrasada_nao_cria_perdida_fantasma_no_horario_registrado(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 11:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        // A pessoa tomou o remédio das 08h só às 10h — dose real, já
        // registrada (mesmo payload que app/(tabs)/index.tsx manda).
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 10:00:00',
            'status' => 'taken',
        ]);

        // Confirma "Ajustar as próximas doses de hoje" com a âncora
        // 10:00 (instante absoluto — perfil em UTC, então bate igual).
        $this->actingAs($user)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '2026-07-15T10:00:00Z',
        ])->assertOk();

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");

        $response->assertOk();
        $statuses = collect($response->json())->pluck('status', 'scheduled_at');
        // Nenhuma ocorrência às 10h (a âncora do recálculo) — só a
        // próxima de verdade, 18h, ainda pendente.
        $this->assertFalse($statuses->keys()->contains(fn ($k) => str_contains($k, '10:00')));
        // Corrigido 2026-09-09: bug real reportado pelo Rilson — a dose
        // das 08h (que ele ACABOU de marcar como tomada, gatilho do
        // próprio recálculo) sumia inteira da tela "Hoje", não só
        // parava de gerar uma "perdida" fantasma às 10h. A asserção
        // original aqui (`['pending']`) tratava esse sumiço como
        // correto — não era; a dose tomada continua tendo que aparecer,
        // só a próxima pendente (18h) é realmente nova.
        $this->assertSame(['taken', 'pending'], $statuses->values()->all());

        // A dose das 08h continua tomada no banco — o recálculo não
        // desfez nem duplicou o log real, só parou de gerar uma NOVA
        // ocorrência em cima dela (ela já é passado, resolvida — quem
        // ainda a devolve na resposta é o log órfão, não a ocorrência).
        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'status' => 'taken',
        ]);
        // A garantia principal: só existe 1 log pra este schedule hoje —
        // nenhuma dose "perdida" fantasma foi criada pelo recálculo.
        $this->assertSame(1, DoseLog::where('dose_schedule_id', $schedule->id)->count());
    }

    // Mesmo cenário do teste acima, mas com perfil fora de UTC — cobre a
    // combinação dos dois bugs achados na mesma auditoria (2026-09-09):
    // o log órfão reincluído em "Hoje" precisa vir com o instante
    // absoluto CERTO, não só reaparecer com hora errada.
    public function test_log_orfao_do_recalculo_aparece_com_horario_certo_pra_perfil_fora_de_utc(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 14:00:00', 'UTC')); // 11:00 em Recife

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        // Tomou o das 08h (local) só às 10h (local) = 13h UTC.
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 10:00:00',
            'status' => 'taken',
        ]);

        $this->actingAs($user)->postJson("/api/schedules/{$schedule->id}/recalculate-today", [
            'anchor_time' => '2026-07-15T13:00:00Z', // 10:00 em Recife
        ])->assertOk();

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/today");
        $response->assertOk();

        $taken = collect($response->json())->firstWhere('status', 'taken');
        $this->assertNotNull($taken, 'dose tomada deveria reaparecer em "Hoje"');
        // 08:00 em Recife (UTC-3) = 11:00 UTC — não 08:00 UTC, que seria o
        // bug de fuso da mesma auditoria se a leitura do log órfão não
        // convertesse certo.
        $this->assertSame('2026-07-15T11:00:00.000000Z', $taken['scheduled_at']);
        $this->assertSame('2026-07-15T13:00:00.000000Z', $taken['taken_at']);
    }
}
