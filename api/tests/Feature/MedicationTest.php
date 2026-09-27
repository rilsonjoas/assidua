<?php

namespace Tests\Feature;

use App\Actions\GenerateScheduleOccurrences;
use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MedicationTest extends TestCase
{
    use RefreshDatabase;

    public function test_cria_medicamento_com_estoque_automatico(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
            'unit' => 'mg',
        ]);

        $response->assertCreated();
        $medication = Medication::where('name', 'Losartana')->first();
        $this->assertNotNull($medication);
        $this->assertDatabaseHas('stock_items', ['medication_id' => $medication->id]);
    }

    // Achado real de uso (2026-08-14): nem todo remédio tem dosagem
    // numérica que valha a pena cadastrar (pomada, "conforme
    // orientação médica"). Obrigar sempre foi fricção sem ganho.
    public function test_cria_medicamento_sem_dosagem(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Pomada para assadura',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('medications', ['name' => 'Pomada para assadura', 'dosage' => null]);
    }

    public function test_limpa_dosagem_de_medicamento_existente(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'dosage' => '50']);

        $response = $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'dosage' => null,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('medications', ['id' => $medication->id, 'dosage' => null]);
    }

    // "Duração do tratamento" (2026-08-14) — achado real de uso, anotado
    // no Obsidian: muitos remédios têm limite de dias pra tomar.
    public function test_cria_medicamento_com_duracao_de_tratamento(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-10 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Amoxicilina',
            'treatment_duration_days' => 10,
        ]);

        $response->assertCreated();
        $medication = Medication::where('name', 'Amoxicilina')->first();
        $this->assertSame(10, $medication->treatment_duration_days);
        // Cadastrado em 10/08, dura 10 dias -> termina em 20/08.
        $this->assertSame('2026-08-20', $medication->treatment_ends_at);

        Carbon::setTestNow();
    }

    // Bug real achado 2026-09-09 (mesma auditoria de fuso do DoseLog):
    // cadastrar um remédio entre meia-noite e 3h da manhã no horário de
    // Brasília já é "amanhã" em UTC — somar os dias de duração e pegar só
    // a data direto em UTC, sem converter pro fuso do perfil antes,
    // errava o fim do tratamento em 1 dia inteiro nesse intervalo.
    public function test_treatment_ends_at_usa_o_dia_local_do_perfil_nao_o_dia_utc(): void
    {
        // 23:30 em America/Sao_Paulo (UTC-3) em 10/08 = 02:30 UTC já em
        // 11/08 — virou o dia em UTC, mas pra quem cadastrou ainda é 10/08.
        Carbon::setTestNow(Carbon::parse('2026-08-11 02:30:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Sao_Paulo']);

        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'treatment_duration_days' => 10,
        ]);

        // Localmente ainda é 10/08 (não 11/08) — dura 10 dias, termina em
        // 20/08. Se usasse a data UTC (11/08) sem converter, daria 21/08
        // — 1 dia errado.
        $this->assertSame('2026-08-20', $medication->treatment_ends_at);

        Carbon::setTestNow();
    }

    public function test_medicamento_sem_duracao_nao_tem_treatment_ends_at(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'treatment_duration_days' => null]);

        $this->assertNull($medication->treatment_ends_at);
    }

    public function test_rejeita_duracao_de_tratamento_menor_que_1_dia(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Amoxicilina',
            'treatment_duration_days' => 0,
        ]);

        $response->assertUnprocessable();
    }

    public function test_estoque_usa_unidade_padrao_quando_nao_informada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
            'dosage' => '50',
        ])->assertCreated();

        $medication = Medication::where('name', 'Losartana')->first();
        $this->assertSame('comprimidos', $medication->stock->unit);
    }

    public function test_bloqueia_decimo_sexto_medicamento_ativo_no_plano_gratuito(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->count(15)->create(['profile_id' => $profile->id, 'is_active' => true]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Décimo sexto remédio',
            'dosage' => '10',
        ]);

        $response->assertForbidden();
        $this->assertSame(15, Medication::where('profile_id', $profile->id)->count());
    }

    public function test_medicamento_inativo_nao_conta_para_o_limite(): void
    {
        $user = User::factory()->create(['subscription_tier' => 'free']);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->count(14)->create(['profile_id' => $profile->id, 'is_active' => true]);
        Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Novo remédio',
            'dosage' => '10',
        ]);

        $response->assertCreated();
    }

    public function test_usuario_pro_nao_tem_limite_de_medicamentos(): void
    {
        $user = User::factory()->create([
            'subscription_tier' => 'pro',
            'subscription_expires_at' => now()->addMonth(),
        ]);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->count(15)->create(['profile_id' => $profile->id, 'is_active' => true]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Décimo sexto remédio',
            'dosage' => '10',
        ]);

        $response->assertCreated();
    }

    public function test_index_lista_apenas_medicamentos_ativos(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => true]);
        Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);

        $response = $this->actingAs($user)->getJson("/api/profiles/{$profile->id}/medications");

        $response->assertOk()->assertJsonCount(1);
    }

    public function test_nao_permite_criar_medicamento_em_perfil_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Invasor',
            'dosage' => '10',
        ]);

        $response->assertForbidden();
    }

    public function test_nao_permite_editar_medicamento_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $this->actingAs($intruder)
            ->putJson("/api/medications/{$medication->id}", ['name' => 'Hackeado'])
            ->assertForbidden();
    }

    // =============================================================
    // P4 (§10.4) — o remédio de resgate precisa ser MARCAVEL.
    //
    // Este teste existe por causa de um buraco real: a coluna `is_prn`
    // existia, a dose de resgate tinha backend, fila, relatório e
    // adesão prontos — e a validação do `store`/`update` não aceitava
    // o campo. O caminho inteiro era inalcançável: nenhum app, nenhum
    // cliente, ninguém conseguia dizer "este é um remédio de resgate".
    // Toda a feature podia estar "pronta" e ainda assim ser impossível
    // de usar, sem um único teste vermelho.
    // =============================================================

    public function test_cria_medicamento_de_resgate_marcando_is_prn(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Dipirona',
            'is_prn' => true,
        ]);

        $response->assertCreated();
        $this->assertTrue($response->json('is_prn'), 'o app precisa LER o que marcou');
        $this->assertDatabaseHas('medications', [
            'profile_id' => $profile->id,
            'name' => 'Dipirona',
            'is_prn' => true,
        ]);
        // De resgate por definição: nenhum horário previsto.
        $this->assertCount(0, $response->json('schedules'));
    }

    public function test_cadastro_comum_permanece_nao_resgate_por_padrao(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)->postJson("/api/profiles/{$profile->id}/medications", [
            'name' => 'Losartana',
        ])->assertCreated();

        // O default da migration não pode vazar: todo medicamento já
        // cadastrado no app tem de continuar "não é resgate".
        $this->assertFalse(Medication::where('name', 'Losartana')->first()->is_prn);
    }

    public function test_edita_medicamento_marcando_e_desmarcando_resgate(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'is_prn' => true,
        ])->assertOk();
        $this->assertTrue($medication->fresh()->is_prn);

        // E volta: alguém pode cadastrar como resgate e depois
        // descobrir que ele tem horário fixo.
        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'is_prn' => false,
        ])->assertOk();
        $this->assertFalse($medication->fresh()->is_prn);
    }

    // =============================================================
    // P4 (§10.4) — virar resgate tem que DORMIR os horários, não só
    // piscar a bandeirinha.
    //
    // Furo real, encontrado rodando o fluxo inteiro e não por leitura de
    // código: Losartana com 8h todo dia, marcada como "só quando
    // precisar". O que acontecia de verdade —
    //
    //   1. a tela Hoje CONTINUAVA gerando a dose das 8h;
    //   2. o cron de 15 em 15min marcava essa dose como PERDIDA;
    //   3. a adesão caía, para quem tinha feito tudo certo;
    //   4. a tela de cadastro escondia a seção de horários — justamente
    //      a única forma de corrigir;
    //   5. e a dose, se a pessoa registrasse, entrava no relatório como
    //      ocorrência COMUM, sem nenhum tratamento de resgate.
    //
    // Nenhum teste existente pegaria nada disso: eles cobrem o cadastro
    // do PRN e o registro da dose de resgate, nunca a TRANSIÇÃO de um
    // que já tinha horário.
    // =============================================================

    public function test_virar_resgate_dorme_o_horario_que_existia(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => false]);
        $schedule = $medication->schedules()->create([
            'time' => '08:00:00',
            'days_of_week' => null,
        ]);

        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'is_prn' => true,
        ])->assertOk();

        $this->assertTrue($medication->fresh()->is_prn);
        $this->assertFalse(
            $schedule->fresh()->is_active,
            'o horário tem de dormir: enquanto ativo, ele continua gerando dose e sendo marcado como perdido'
        );
    }

    // O histórico não pode quebrar por causa disso: a dose já registrada
    // aponta para o horário, e desativar (em vez de apagar) mantém essa
    // referência de pé. O sinal dessa é que apagar deixaria órfã.
    public function test_dormir_o_horario_preserva_o_historico_ja_registrado(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => false]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-09-20 08:00:00',
            'taken_at' => '2026-09-20 08:00:00',
            'status' => 'taken',
        ]);

        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'is_prn' => true,
        ])->assertOk();

        $log = DoseLog::where('medication_id', $medication->id)->first();
        $this->assertNotNull($log, 'a dose já registrada não pode sumir');
        $this->assertSame($schedule->id, $log->dose_schedule_id, 'e continua apontando para o horário');
        $this->assertNotNull($log->doseSchedule, 'que continua existente — desativado, não apagado');
    }

    // A segunda linha de defesa: mesmo com dado inconsistente (promessa
    // antiga, edição direta no banco, cliente futuro que não passe pelo
    // controller), um PRN com horário ativo não gera ocorrência — porque
    // é por `GenerateScheduleOccurrences` que passam a tela Hoje E o cron.
    public function test_prn_com_horario_ativo_nao_gera_ocorrencia(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $ocorrencias = app(GenerateScheduleOccurrences::class)
            ->handle($schedule->fresh()->setRelation('medication', $medication), Carbon::parse('2026-09-27', 'UTC'));

        $this->assertSame([], $ocorrencias, 'remédio de resgate não tem horário previsto para gerar');
    }

    public function test_salvar_is_prn_repetido_nao_reexecuta_a_virada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // Reativa o horário na mão e reenvia `is_prn: true` — que é o que
        // um app que reenvia o formulário inteiro faz.
        $schedule->update(['is_active' => true]);
        $this->actingAs($user)->putJson("/api/medications/{$medication->id}", [
            'name' => $medication->name,
            'is_prn' => true,
        ])->assertOk();

        $this->assertTrue(
            $schedule->fresh()->is_active,
            'sem transição de verdade, nada é reescrito — reenviar o formulário não pode'
            . ' desativar um horário que a pessoa acabou de reativar'
        );
    }
}
