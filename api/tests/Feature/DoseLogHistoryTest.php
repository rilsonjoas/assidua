<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DoseLogHistoryTest extends TestCase
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

    /**
     * Cria um log **e** o horário que o gera, no mesmo instante.
     *
     * P2/§10.2: o Histórico passou a derivar por ocorrência, então um log
     * só aparece se existir uma ocorrência no mesmo horário. Antes, o
     * fixture criava o log com `scheduled_at = now()` (12:00) e o
     * horário às 08:00 — instantes que não se cruzam. Sob o contrato
     * antigo isso não importava (a query lia `dose_logs`); agora importa,
     * e o fixture é que estava errado, não o código.
     */
    private function createLog(Profile $profile, Medication $medication, array $overrides = []): DoseLog
    {
        $scheduledAt = $overrides['scheduled_at'] ?? '2026-07-15 08:00:00';
        $at = Carbon::parse($scheduledAt);

        $schedule = $medication->schedules()->create([
            'time' => $at->format('H:i:s'),
            'days_of_week' => null,
            'is_active' => true,
        ]);

        return DoseLog::create(array_merge([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt,
            'status' => 'taken',
        ], $overrides));
    }

    // ══ P2 (§10.2): o Histórico é um visualizador de LOGS, não de DOSES ══
    //
    // `history()` consulta `dose_logs`, então só aparece o que JÁ TEM
    // registro. Uma dose prevista e nunca registrada **some da tela
    // inteira** — a pessoa não tem como saber que ela existiu. O app só
    // volta a mostrá-la 24 h depois, quando o cron a marca como `missed`.
    //
    // Isso é a inconsistência estrutural: Hoje e o Relatório já derivam
    // por ocorrência; o Histórico e o Export não. Cinco consumidores,
    // duas verdades.
    public function test_dose_prevista_e_nunca_registrada_aparece_no_historico(): void
    {
        // P2 / §10.2 — este teste era a PROVA do furo e falhava com
        // "actual size 0". Passa agora: o Histórico deriva por
        // ocorrência, então a dose prevista e nunca registrada aparece
        // com estado `unrecorded`. A prova virou verificação.
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null, 'is_active' => true]);

        // Agora é 2026-07-15 12:00. A dose das 08:00 de HOJE já venceu e
        // ninguém registrou nada. Ela precisa estar no histórico, com
        // estado derivado — não ausente.
        $response = $this->historico($user, $profile);

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonFragment([
            'status' => 'unrecorded',
            'scheduled_at' => '2026-07-15T08:00:00+00:00',
        ]);
    }

    // E o outro lado: uma dose registrada NÃO pode duplicar quando a
    // ocorrência também é gerada. A ocorrência e o log descrevem a mesma
    // Reality; o Histórico tem que mostrar UMA linha.
    public function test_dose_registrada_nao_duplica_no_historico(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        $this->createLog($profile, $medication, ['scheduled_at' => '2026-07-15 08:00:00']);

        $response = $this->historico($user, $profile);

        $response->assertOk()->assertJsonCount(1, 'data');
        $response->assertJsonFragment(['status' => 'taken']);
    }

    /**
     * Chama o Histórico com a janela **declarada**.
     *
     * P2/§10.2: o Histórico passou a derivar por ocorrência, e a janela
     * segue o pedido (decisão D11 — 90 dias é só o fallback quando o app
     * não manda filtro). Um horário diário gera uma ocorrência por dia,
     * então sem `date_to` a janela padrão devolveria 90 linhas e o teste
     * contaria data, não comportamento.
     *
     * O default é o dia do `setUp` (2026-07-15) — o suficiente para a
     * maioria dos testes, e explícito onde importa.
     */
    private function historico(User $user, Profile $profile, array $params = [])
    {
        $query = http_build_query(array_merge([
            'date_from' => '2026-07-15',
            'date_to' => '2026-07-15',
        ], $params));

        return $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/doses/history?{$query}");
    }

    public function test_lista_historico_do_perfil(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication);

        $response = $this->historico($user, $profile);

        $response->assertOk()->assertJsonCount(1, 'data');
    }

    // Marcador de troca de fuso (2026-09-11, entrevista de decisões de
    // horário — ver ROADMAP.md, item 6/20) — devolvido junto do
    // histórico, não como tabela separada de dose_logs. Fora do
    // paginador de doses (é uma fonte diferente), mas no mesmo response.
    public function test_historico_devolve_trocas_de_fuso_do_periodo(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $profile->timezoneChanges()->create([
            'old_timezone' => 'America/Sao_Paulo',
            'new_timezone' => 'Europe/Lisbon',
            'changed_at' => now(),
        ]);
        // Fora da janela original de 30 dias — NÃO deve mais aparecer:
        // o piso agora é `HISTORY_FLOOR_DAYS` (10 anos), então uma troca
        // de fuso de 40 dias atrás entra junto com a de agora.
        $profile->timezoneChanges()->create([
            'old_timezone' => 'UTC',
            'new_timezone' => 'America/Sao_Paulo',
            'changed_at' => now()->subDays(40),
        ]);

        // Janela cobrindo as duas trocas (hoje e 40 dias atrás) — D11: a
        // janela segue o pedido, e quem pede é o app.
        $response = $this->historico($user, $profile, [
            'date_from' => now()->subDays(60)->toDateString(),
            'date_to' => now()->toDateString(),
        ]);

        $response->assertOk()->assertJsonCount(2, 'timezone_changes');
    }

    public function test_filtra_por_status(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['status' => 'taken']);
        $this->createLog($profile, $medication, ['status' => 'skipped']);

        $response = $this->historico($user, $profile, ['status' => 'skipped']);

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame('skipped', $response->json('data.0.status'));
    }

    public function test_filtra_por_medicamento(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medicationA = Medication::factory()->create(['profile_id' => $profile->id]);
        $medicationB = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medicationA);
        $this->createLog($profile, $medicationB);

        $response = $this->historico($user, $profile, ['medication_id' => $medicationA->id]);

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($medicationA->id, $response->json('data.0.medication_id'));
        // E o filtro é de verdade: o remédio B não aparece, mesmo tendo
        // mesmo número de ocorrências no mesmo dia.
        $this->assertNotContains($medicationB->id, array_column($response->json('data'), 'medication_id'));
    }

    public function test_filtra_por_intervalo_de_datas(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => Carbon::parse('2026-07-10 08:00:00')]);
        $this->createLog($profile, $medication, ['scheduled_at' => Carbon::parse('2026-07-14 08:00:00')]);

        $response = $this->historico($user, $profile, ['date_from' => '2026-07-13', 'date_to' => '2026-07-15']
        );

        $response->assertOk();
        // Sob o contrato novo o Histórico devolve OCORRÊNCIAS: 3 dias x
        // 2 horários diários = 6. O log de 10/07 (fora da janela) some,
        // e o de 14/07 aparece como `recorded`. É a prova de que o
        // `date_from`/`date_to` filtra — e de que filtra a ocorrência,
        // não o log.
        $response->assertJsonCount(6, 'data');
        $datas = array_map(fn ($d) => Carbon::parse($d['scheduled_at'])->toDateString(), $response->json('data'));
        // Ordena porque a API devolve mais recente primeiro, e a
        // asserção é sobre o conjunto de dias, não sobre a ordem.
        $dias = array_values(array_unique($datas));
        sort($dias);
        $this->assertSame(['2026-07-13', '2026-07-14', '2026-07-15'], $dias);
        $this->assertContains('recorded', array_column($response->json('data'), 'state'));
        $this->assertNotContains('2026-07-10', $datas);
    }

    // T1 (2026-09-25): o histórico é registro da própria pessoa, não
    // recurso Premium. Este teste ANTES afirmava o contrário — free não
    // via além de 30 dias. Ver `HISTORY_FLOOR_DAYS` no controller.
    public function test_usuario_free_ve_o_historico_inteiro_dele(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(5)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(45)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(400)]);

        // Janela estreita em torno do dia de 400 dias. Uma janela de 420
        // dias geraria 420 ocorrências e a de 400 cairia numa página do
        // meio — o teste passaria a medir paginação, não acesso. E é
        // assim que o app realmente usa (D11: a janela segue o pedido).
        $response = $this->historico($user, $profile, [
            'date_from' => now()->subDays(401)->toDateString(),
            'date_to' => now()->subDays(399)->toDateString(),
        ]);

        $response->assertOk();
        // O que o teste do T1 prova é que o free ALCANÇA o dado antigo.
        // A asserção passou a ser sobre a data, não sobre a contagem:
        // o Histórico devolve ocorrências (1 por dia), então "3 linhas"
        // media o número de dias da janela, não o acesso.
        // A data mais antiga da janela é o dia 1 dela — um horário diário
        // gera uma ocorrência por dia, registrada ou não — então `min()`
        // não prova acesso. O que prova é que a ocorrência do dia de 400
        // dias está lá **e com o log grudado**.
        // O teste cria 3 `createLog`, e cada uma cria um horário — então
        // no dia de 400 dias há 3 ocorrências, e só uma tem o log. Por
        // isso a asserção é "**alguma** está recorded", não "a primeira".
        $estados = collect($response->json('data'))
            ->filter(fn ($d) => Carbon::parse($d['scheduled_at'])->isSameDay(now()->subDays(400)))
            ->pluck('state');
        $this->assertNotEmpty($estados, 'O free precisa alcançar o dia de 400 dias atrás.');
        $this->assertContains('recorded', $estados->all(), 'E o log de 400 dias atrás tem de estar lá.');
    }

    // Trimestre de reassure o livre: o free e o pro enxergam EXATAMENTE
    // o mesmo conjunto. Se um dia este teste falhar porque os dois
    // divergiram de novo, o paywall de leitura voltou.
    public function test_free_e_pro_enxergam_o_mesmo_historico(): void
    {
        $free = User::factory()->create(['subscription_tier' => 'free']);
        $pro = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addMonth(),
        ]);

        $ids = [];
        foreach ([$free, $pro] as $user) {
            $profile = Profile::factory()->create(['user_id' => $user->id]);
            $medication = Medication::factory()->create(['profile_id' => $profile->id]);
            foreach ([5, 45, 400] as $daysAgo) {
                $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays($daysAgo)]);
            }
            // Janela explícita alcançando o log mais antigo (400 dias).
            // Sem ela, a janela padrão de 90 dias devolveria zero — e o
            // teste passaria a medir a janela, não o T1.
            // Janela estreita em torno do dia de 400 dias — pelo mesmo
            // motivo do teste anterior: medir acesso, não paginação.
            $response = $this->historico($user, $profile, [
                'date_from' => now()->subDays(401)->toDateString(),
                'date_to' => now()->subDays(399)->toDateString(),
            ]);
            $response->assertOk();
            $ids[$user->id] = $response->json('data');
        }

        // Mesma razão do teste anterior: a data mais antiga da janela é o
        // dia 1 dela, então o que prova acesso é a ocorrência do dia de
        // 400 dias **com o log grudado**.
        $estadoNoDia = fn (array $rows) => collect($rows)
            ->filter(fn ($r) => Carbon::parse($r['scheduled_at'])->isSameDay(now()->subDays(400)))
            ->pluck('state')->all();
        $this->assertContains(
            'recorded',
            $estadoNoDia($ids[$free->id]),
            'O free precisa alcançar o mesmo dado antigo que o Pro.',
        );
        $this->assertSame(
            array_column($ids[$free->id], 'scheduled_at'),
            array_column($ids[$pro->id], 'scheduled_at'),
            'Free e Pro enxergam exatamente o mesmo histórico.',
        );
    }

    // O piso de janela também não pode virar paywall disfarçado: o
    // `?date_from`/`?date_to` é o que o usuário usa para segurar o volume,
    // e ele precisa alcançar a mesma data antiga que a listagem padrão.
    public function test_filtro_de_periodo_alcanca_historico_antigo_para_o_free(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(5)]);
        $this->createLog($profile, $medication, ['scheduled_at' => now()->subDays(200)]);

        $response = $this->historico($user, $profile, [
            'date_from' => now()->subDays(365)->toDateString(),
            'date_to' => now()->toDateString(),
        ]);

        $response->assertOk();
        // Agora o Histórico devolve **ocorrências**, não logs: 365 dias x
        // 1 horário diário dá 365 linhas, e as 2 registradas estão
        // entre elas. O que o teste prova — T1 — é que o free ALCANÇA o
        // dado antigo, e que a resposta diz qual janela está servindo.
        $this->assertGreaterThan(300, $response->json('total'));
        $states = array_column($response->json('data'), 'state');
        $this->assertContains('recorded', $states);
        $this->assertSame(
            now()->subDays(365)->toDateString(),
            $response->json('derived_window.from'),
            'A janela é dita, não assumida — o número não pode parecer completo sem ser.',
        );
    }

    public function test_nao_permite_ver_historico_de_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($intruder)
            ->getJson("/api/profiles/{$profile->id}/doses/history")
            ->assertForbidden();
    }

    // Bug real achado 2026-09-09 (auditoria pedida pelo Rilson depois do
    // bug do "sumiu do Hoje"): `scheduled_at`/`taken_at` são gravados no
    // banco como hora LOCAL do perfil, sem fuso — mas o cast `'datetime'`
    // do Eloquent lê esse valor cru e rotula com `config('app.timezone')`
    // (UTC), errado. Antes da correção, `history()` devolvia esta dose
    // (perfil em America/Recife, gravada às 08:00 local) como
    // "2026-07-15T08:00:00Z" — 3h adiantado do instante absoluto real
    // ("2026-07-15T11:00:00Z"), que é exatamente o que `today()` devolve
    // pra essa mesma dose. Corrigido lendo via
    // DoseLog::scheduledAtInTimezone/takenAtInTimezone (ver Model) em vez
    // do atributo cru do Eloquent, em todo lugar que serializa um DoseLog.
    public function test_scheduled_at_e_taken_at_batem_com_o_instante_absoluto_real_pra_perfil_fora_de_utc(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $this->createLog($profile, $medication, [
            'scheduled_at' => '2026-07-15 08:00:00', // hora local do perfil
            'taken_at' => '2026-07-15 08:05:00',
        ]);

        $response = $this->historico($user, $profile);
        $response->assertOk();

        // America/Recife é UTC-3 (sem horário de verão desde 2019) — 08:00
        // local = 11:00 UTC. É o mesmo instante que `today()` calcularia
        // pra um schedule às 08:00 nesse perfil (ver GenerateScheduleOccurrences).
        // Mesmo instante, representação diferente: a derivação devolve o
        // offset do PERFIL (`08:00-03:00`), e o instinto diz que isso é
        // menos preciso que o `Z`. Não é — `08:00-03:00` **é** `11:00Z`.
        // O que a tela precisa é o instante certo, no fuso do usuário.
        $this->assertSame(
            '2026-07-15T11:00:00.000000Z',
            Carbon::parse($response->json('data.0.scheduled_at'))->utc()->format('Y-m-d\TH:i:s.u\Z'),
        );
        $this->assertSame(
            '2026-07-15T11:05:00.000000Z',
            Carbon::parse($response->json('data.0.taken_at'))->utc()->format('Y-m-d\TH:i:s.u\Z'),
        );
    }
}
