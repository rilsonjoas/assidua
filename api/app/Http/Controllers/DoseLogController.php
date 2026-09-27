<?php

namespace App\Http\Controllers;

use App\Actions\CalculateAdherenceStreak;
use App\Actions\CalculateDailyAdherence;
use App\Actions\CalculateWeeklyAdherence;
use App\Actions\GenerateConsultationSummary;
use App\Actions\DeriveDoseOccurrences;
use App\Actions\GenerateScheduleOccurrences;
use App\Actions\MarkDoseMissedAndNotifyCollaborators;
use App\Actions\ReactToDoseLog;
use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\DoseSchedule;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class DoseLogController extends Controller
{
    /**
     * Piso de segurança da janela de histórico — em dias.
     *
     * NÃO é um paywall. Antes desta constante a janela era
     * `isPro() ? 3650 : 30`, e o teste de regressão é `CLAUDE.md`:
     * o paciente não pode perder o acesso ao próprio registro por causa
     * de plano. O plano barra CRIAÇÃO de recurso (perfis, medicamentos,
     * cuidador) e formata ARTEFATO (resumo de consulta, PDF) — nunca
     * leitura do que a pessoa já registrou, nunca export.
     *
     * O número continua existindo por dois motivos practical, não de
     * produto: (a) a query dos `timezoneChanges` abaixo é um `get()` sem
     * paginação e precisa de um teto; (b) um piso generoso protege de
     * uma data absurda vinda de parâmetro. Nenhum paciente tem 10 anos
     * de dose neste app, então na prática isto é "sempre".
     */
    private const HISTORY_FLOOR_DAYS = 3650;

    /**
     * Fallback da janela de derivação quando o app não manda
     * `date_to` (decisão D11). A janela **segue o pedido**; isto é só o
     * piso do "não sei, mostra alguma coisa". Não é questão legal: é
     * custo de CPU.
     */
    private const HISTORY_DERIVED_WINDOW_DAYS = 90;

    private const HISTORY_PER_PAGE = 50;

    public function today(Request $request, Profile $profile, MarkDoseMissedAndNotifyCollaborators $markMissed, GenerateScheduleOccurrences $generateOccurrences): JsonResponse
    {
        // Fase 1.5 (2026-08-09): abort_if direto virou Gate::authorize —
        // ProfilePolicy::view agora também aceita colaborador aceito, não
        // só dono. Sem essa troca, o cuidador remoto nunca conseguiria
        // ver a tela Hoje do paciente.
        Gate::authorize('view', $profile);

        // Achado 2026-08-10: "hoje" tem que ser o dia no fuso de quem usa
        // o perfil, não em UTC — sem isso a virada de dia acontecia às
        // 21h em Brasília (3h adiantada), 19-20h no Norte/Nordeste-Oeste.
        $today = Carbon::today($profile->timezone);

        $medications = $profile->medications()
            ->with([
                'schedules' => fn ($q) => $q->where('is_active', true),
                'stock',
            ])
            ->where('is_active', true)
            // Achado real do Rilson (2026-09-12): "pausado" NÃO filtra
            // mais o medicamento inteiro daqui — fazia a dose de HOJE já
            // tomada antes da pausa sumir junto (mesma família do bug de
            // "duplicar" já corrigido). GenerateScheduleOccurrences agora
            // decide isso caso a caso, pelo instante exato da pausa
            // (`paused_at`) — ocorrência até esse instante conta,
            // depois dele nunca é gerada. Ver comentário lá.
            ->get();

        $doses = [];

        foreach ($medications as $medication) {
            foreach ($medication->schedules as $schedule) {
                // Evita N+1 em GenerateScheduleOccurrences (que precisa
                // de `$schedule->medication` pra checar pausa) — a
                // relação inversa não vem de graça só por ter carregado
                // via `$medication->schedules` acima.
                $schedule->setRelation('medication', $medication);

                // "Frequência de horário" (2026-08-14): um schedule pode
                // gerar mais de uma dose no dia agora (ex.: de 8 em 8h ->
                // 3 ocorrências). GenerateScheduleOccurrences decide
                // quantas e a que horas — nada aqui mais assume 1 por dia.
                $occurrences = $generateOccurrences->handle($schedule, $today);

                // Achado real do Rilson (2026-09-09): usado pra saber, no
                // final do loop, quais `scheduled_at` de hoje JÁ foram
                // cobertos por uma ocorrência computada — o que sobrar fora
                // disso são logs "órfãos" (ver comentário abaixo).
                $matchedScheduledAtKeys = [];

                foreach ($occurrences as $scheduledAt) {
                    $key = $scheduledAt->format('Y-m-d H:i:s');
                    $matchedScheduledAtKeys[] = $key;

                    // Busca log existente para esta ocorrência específica
                    // (horário exato, não só o dia — com múltiplas doses
                    // por dia, "o log de hoje" deixou de identificar uma
                    // ocorrência sozinho).
                    $log = DoseLog::with('reactedBy:id,name')
                        ->where('dose_schedule_id', $schedule->id)
                        ->where('scheduled_at', $key)
                        ->first();

                    // Status automático "Perdido" (Fase 1 do roadmap): dose
                    // cujo horário já passou e ninguém agiu vira `missed` —
                    // registrado agora (não só calculado na resposta), pra
                    // entrar de verdade no histórico/adesão depois. Continua
                    // acionável: o usuário ainda pode tocar "Tomei" e
                    // sobrescrever (store() já faz updateOrCreate pela
                    // mesma chave dose_schedule_id+scheduled_at).
                    //
                    // Fase 1.5, Etapa 4: a criação virou MarkDoseMissedAndNotifyCollaborators
                    // — mesma ação usada pelo comando agendado, garante que
                    // o cuidador é avisado tanto quando o paciente abre o
                    // app quanto quando ninguém abre (cron).
                    //
                    // Tolerância de 24h (2026-09-11, entrevista de decisões
                    // de horário — ver ROADMAP.md): mesma regra/constante
                    // do comando agendado (`DoseLog::MISSED_TOLERANCE_HOURS`)
                    // — sem isso, abrir o app durante a janela de "Atrasado"
                    // (calculada no cliente) marcaria "Perdido" na hora só
                    // por ter aberto a tela, contradizendo a tolerância.
                    if (! $log && $scheduledAt->copy()->addHours(DoseLog::MISSED_TOLERANCE_HOURS)->isPast()) {
                        $log = $markMissed->handle($schedule, $medication, $profile, $scheduledAt);
                    }

                    $doses[] = $this->formatDose($log, $schedule, $medication, $profile, $scheduledAt);
                }

                // Bug real reportado pelo Rilson (2026-09-09): depois de
                // "Outro horário" + confirmar o recálculo (recalculateToday),
                // a dose que ele ACABOU de marcar como tomada sumia
                // inteira da tela "Hoje". Causa: GenerateScheduleOccurrences
                // pula de propósito a própria âncora do override (pra não
                // orfanar esse DoseLog nem criar um "perdido" fantasma em
                // cima dele — ver comentário lá) — mas nada aqui reincluía
                // esse log na resposta. O DoseLog continuava certinho no
                // banco (por isso o Histórico sempre mostrou ele direito),
                // só a tela "Hoje" parava de listar ele. Corrigido buscando
                // também qualquer log de hoje deste schedule que não bateu
                // em nenhuma ocorrência computada acima, e devolvendo ele
                // também — sempre já resolvido (taken/skipped/missed),
                // nunca pendente, então não reabre ação nenhuma à toa.
                $orphanedLogs = DoseLog::with('reactedBy:id,name')
                    ->where('dose_schedule_id', $schedule->id)
                    ->whereDate('scheduled_at', $today)
                    ->whereNotIn('scheduled_at', $matchedScheduledAtKeys)
                    ->get();

                foreach ($orphanedLogs as $log) {
                    $doses[] = $this->formatDose(
                        $log,
                        $schedule,
                        $medication,
                        $profile,
                        $log->scheduledAtInTimezone($profile->timezone),
                    );
                }
            }
        }

        // Ordena por horário
        usort($doses, fn ($a, $b) => strcmp($a['scheduled_at'], $b['scheduled_at']));

        return response()->json($doses);
    }

    /**
     * @return array<string, mixed>
     */
    private function formatDose(?DoseLog $log, DoseSchedule $schedule, $medication, Profile $profile, Carbon $scheduledAt): array
    {
        return [
            // Sufixo HHmm no id pendente: com múltiplas ocorrências
            // do mesmo schedule no dia, "pending_<scheduleId>"
            // sozinho colidiria entre elas.
            'id' => $log?->id ?? 'pending_' . $schedule->id . '_' . $scheduledAt->format('Hi'),
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => $scheduledAt->toISOString(),
            // Bug de fuso horário (2026-09-09, ver DoseLog::takenAtInTimezone)
            // — nunca ler `$log->taken_at` cru aqui, sai rotulado com o fuso
            // errado (UTC do app, não o do perfil).
            'taken_at' => $log?->takenAtInTimezone($profile->timezone)?->toISOString(),
            'status' => $log?->status ?? 'pending',
            'notes' => $log?->notes,
            // "Reação do cuidador" (2026-08-22) — só existe
            // depois de a dose já ter um log de verdade
            // (não faz sentido reagir a uma dose pendente).
            'reacted_at' => $log?->reacted_at,
            'reacted_by_name' => $log?->reactedBy?->name,
            'medication' => $medication->only(['id', 'name', 'dosage', 'unit', 'color', 'days_remaining']),
            'dose_schedule' => $schedule->only(['id', 'time', 'days_of_week', 'interval_hours']),
        ];
    }

    public function history(Request $request, Profile $profile, DeriveDoseOccurrences $deriveOccurrences): JsonResponse
    {
        Gate::authorize('view', $profile);

        // T1 (2026-09-25): era `isPro() ? 3650 : 30` — o plano grátis
        // perdia o acesso ao próprio histórico depois de 30 dias. Agora
        // é o piso incondicional (ver `HISTORY_FLOOR_DAYS` na classe).
        // O que ainda dá para o usuário segurar o volume é o que já
        // existia: `?date_from`/`?date_to` e a paginação de 50.
        // ══ P2 / §10.2 (2026-09-25): o Histórico passa a DERIVAR por
        // ocorrência, como a Home e o Relatório já faziam. ══
        //
        // Antes isto consultava `dose_logs` direto, e aí está o furo
        // estrutural: uma dose prevista e nunca registrada **não
        // aparecia**. A Home dizia 3 doses, o relatório dizia 2 e o
        // Histórico dizia 1 — três telas, três verdades sobre o mesmo
        // dia. A prova está em
        // `DoseLogHistoryTest::test_dose_prevista_e_nunca_registrada_aparece_no_historico`.
        //
        // `DeriveDoseOccurrences` é a fonte única agora, com os mesmos 4
        // estados do relatório, e com cache por dia (chave
        // `occurrences:{perfil}:{geração}:{data}`). O custo deixou de ser
        // "por request" e passou a ser "por dia, uma vez".
        //
        // **A janela segue o pedido** (decisão D11): `date_to` manda, e
        // `HISTORY_DERIVED_WINDOW_DAYS` é só o fallback quando o app não
        // manda filtro. Não é questão legal — é custo de CPU. E a lei
        // joga do outro lado: a LGPD art. 18 dá ao titular acesso aos
        // próprios dados, então limitar artificialmente a janela é o
        // risco, não alargar.

        $windowTo = $request->filled('date_to')
            ? Carbon::parse($request->date_to, $profile->timezone)
            : Carbon::now($profile->timezone);

        $windowFrom = $request->filled('date_from')
            ? Carbon::parse($request->date_from, $profile->timezone)
            : $windowTo->copy()->subDays(self::HISTORY_DERIVED_WINDOW_DAYS);

        // Piso de segurança, o mesmo `HISTORY_FLOOR_DAYS` de antes: uma
        // data absurda vinda de parâmetro não pode fazer o servidor
        // derivar década.
        $hardFloor = Carbon::now($profile->timezone)->subDays(self::HISTORY_FLOOR_DAYS);
        if ($windowFrom->lt($hardFloor)) {
            $windowFrom = $hardFloor;
        }

        $occurrences = $deriveOccurrences->handle(
            $profile,
            $windowFrom,
            $windowTo,
            $request->filled('medication_id') ? (int) $request->medication_id : null,
        );

        // O filtro de status é aplicado SOBRE a lista derivada, não na
        // query. `unrecorded` não é valor de `dose_logs.status` — é estado
        // derivado — então um `where('status', ...)` nunca encontraria a
        // dose que é justamente o motivo desta fase existir.
        if ($request->filled('status')) {
            $wanted = $request->status;
            $occurrences = array_values(array_filter(
                $occurrences,
                fn ($o) => $o['status'] === $wanted,
            ));
        }

        $page = max(1, (int) $request->input('page', 1));
        $perPage = self::HISTORY_PER_PAGE;
        $total = count($occurrences);
        $lastPage = max(1, (int) ceil($total / $perPage));

        return response()->json([
            'data' => array_slice($occurrences, ($page - 1) * $perPage, $perPage),
            'current_page' => $page,
            'last_page' => $lastPage,
            'per_page' => $perPage,
            'total' => $total,
            // A janela é **dita**, não assumida. Sem isto, um histórico
            // maior que a janela pareceria completo — a mesma mentira do
            // `all_taken` com `due === 0`, agora no outro extremo.
            'derived_window' => [
                'from' => $windowFrom->toDateString(),
                'to' => $windowTo->toDateString(),
            ],
            'timezone_changes' => $this->timezoneChangesFor($profile, $windowFrom, $windowTo),
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function timezoneChangesFor(Profile $profile, Carbon $from, Carbon $to): array
    {
        return $profile->timezoneChanges()
            ->where('changed_at', '>=', $from)
            ->where('changed_at', '<=', $to->copy()->endOfDay())
            ->orderBy('changed_at', 'desc')
            ->get(['old_timezone', 'new_timezone', 'changed_at'])
            ->toArray();
    }

    public function store(Request $request, CalculateAdherenceStreak $calculateStreak, GenerateScheduleOccurrences $generateOccurrences): JsonResponse
    {
        // P4 (2026-09-25) — a dose **avulsa** (PRN, "de resgate"): não tem
        // horário previsto, então `dose_schedule_id` e `scheduled_at` são
        // nulos, e a identidade do registro passa a ser o `client_key`.
        //
        // Repare que as regras abaixo são só de FORMATO. Quem decide se a
        // dose é agendada ou avulsa é o guarda logo depois, e essa
        // separação é deliberada: expressar "ou isso, ou aquilo" com
        // `required_without`/`required_without_all` na validação fica
        //-correct só por acidente — e foi exatamente o que aconteceu
        // aqui na primeira versão. `required_without_all:dose_schedule_id,
        // scheduled_at` não rejeita o híbrido (agendada + client_key): a
        // dose agendada era aceita e keyed pelo client_key, e um reenvio
        // da MESMA dose agendada sem a chave caía no outro caminho e
        // criava um log DUPLICADO. O guarda abaixo é um XOR explícito,
        // que não tem como ser lido errado.
        $data = $request->validate([
            'dose_schedule_id' => 'nullable|exists:dose_schedules,id',
            'medication_id' => 'required|exists:medications,id',
            'profile_id' => 'required|exists:profiles,id',
            'scheduled_at' => 'nullable|date',
            'taken_at' => 'nullable|date',
            'status' => 'required|in:taken,skipped,missed',
            'notes' => 'nullable|string|max:500',
            // UUID gerado no aparelho — a dose avulsa é criada offline, e
            // o id do log só existe depois de sincronizar.
            'client_key' => 'nullable|uuid',
        ]);

        // Exatamente um dos dois formatos. Agendada: `dose_schedule_id` +
        // `scheduled_at`, sem chave. Avulsa: só `client_key`. Nem as duas
        // (o híbrido que duplicava), nem nenhuma (sem identidade, sem
        // idempotência, sem como saber o que sobrescrever).
        $ehAgendada = ! empty($data['dose_schedule_id']);
        $ehAvulsa = ! empty($data['client_key']);
        abort_if(
            $ehAgendada === $ehAvulsa,
            422,
            'Envie dose_schedule_id + scheduled_at (dose agendada) ou client_key (dose de resgate), nunca os dois nem nenhum.'
        );

        // A dose agendada PRECISA do horário. Relaxar `scheduled_at` para
        // `nullable` (para a PRN) abriu caminho para `dose_schedule_id` sem
        // horário — e isso grava uma linha com `scheduled_at` nulo, que não
        // pertence a dia nenhum: o histórico não sabe onde colocá-la, a
        // adesão não sabe o que contar, e ninguém vê o erro. A regra é
        // simétrica à da avulsa: cada formato carrega o que o identifica.
        abort_if($ehAgendada && empty($data['scheduled_at']), 422, 'Dose agendada precisa de scheduled_at.');

        $profile = Profile::findOrFail($data['profile_id']);
        Gate::authorize('create', [DoseLog::class, $profile]);

        // Segurança (2026-09-08, achado de auditoria — IDOR): dose_schedule_id
        // e medication_id só eram validados como "existe em algum lugar do
        // banco" (exists:tabela,id), sem checar que pertencem ao PRÓPRIO
        // $profile já autorizado acima — os três IDs eram tratados como
        // independentes. Um usuário autenticado podia enviar seu próprio
        // profile_id (passa no Gate) junto com dose_schedule_id/medication_id
        // de OUTRO perfil, lendo o medicamento alheio na resposta e
        // sobrescrevendo (updateOrCreate) o DoseLog de terceiros. Agora
        // resolve o schedule escopado ao profile — 404 se não pertencer a
        // ele — e confere que o medication_id enviado bate com o do
        // schedule, antes de tocar em qualquer registro.
        // P4: o `medication_id` continua sendo conferido contra o dono do
        // perfil nos **dois** caminhos. Sem isso a porta da dose avulsa
        // viraria um IDOR novo: bastava mandar `medication_id` de um
        // remédio alheio com `client_key` novo, e a validação `exists`
        // passaria.
        if ($ehAgendada) {
            $schedule = DoseSchedule::whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id))
                ->findOrFail($data['dose_schedule_id']);
            abort_unless($schedule->medication_id === (int) $data['medication_id'], 404);
        } else {
            $medication = Medication::where('profile_id', $profile->id)
                ->findOrFail($data['medication_id']);
            abort_unless($medication->is_prn, 422, 'Medicamento não é de resgate.');

            // Dose de resgate **precisa** de `taken_at` e não pode ser
            // `skipped`. "Pular" uma dose de resgate não significa nada:
            // se a pessoa não precisou, ela simplesmente não registra — e
            // um `skipped` de PRN entraria no histórico como decisão sobre
            // um horário que nunca existiu. A exigência fica aqui, e não
            // no `validate`, porque `taken_at` é legitimamente nulo na
            // dose agendada **pulada** e uma regra global quebraria esse
            // caso.
            abort_unless(
                ! empty($data['taken_at']) && $data['status'] !== 'skipped',
                422,
                'Dose de resgate precisa de taken_at e não pode ser pulada.'
            );
        }

        $scheduledAtFormatted = isset($data['scheduled_at'])
            ? Carbon::parse($data['scheduled_at'])->setTimezone($profile->timezone)->format('Y-m-d H:i:s')
            : null;

        // Bug real de fuso horário achado 2026-09-09 (mesma auditoria do
        // "sumiu do Hoje"): `scheduled_at` já convertia pro fuso do perfil
        // antes de gravar (linha acima, desde 2026-09-08) — `taken_at`
        // NUNCA convertia. O app manda um instante absoluto (`toISOString()`,
        // ver app/(tabs)/index.tsx) tanto pro "Tomei" comum quanto pro
        // "Outro horário"; sem essa conversão, o cast automático do
        // Eloquent grava a HORA EM UTC como se fosse a hora local do
        // perfil — para o dono num fuso diferente de UTC, `taken_at`
        // ficava gravado sistematicamente errado, deslocado pelo offset
        // do perfil, todo santo registro. `scheduled_at` e `taken_at`
        // precisam seguir a MESMA convenção (hora local do perfil, sem
        // fuso) pra DoseLog::scheduledAtInTimezone/takenAtInTimezone
        // lerem os dois de volta corretamente.
        $takenAtFormatted = isset($data['taken_at'])
            ? Carbon::parse($data['taken_at'])->setTimezone($profile->timezone)->format('Y-m-d H:i:s')
            : null;

        // P4 (§10.4) — **a chave do `updateOrCreate` depende do caso**.
        //
        // Dose agendada: continua `(dose_schedule_id, scheduled_at)`, como
        // sempre — reenviar a mesma ação 2x nunca duplica.
        //
        // Dose avulsa: os dois campos são nulos, e essa seria a chave
        // `(NULL, NULL)` — a mesma para **todas** as doses avulsas. A
        // segunda sobrescreveria a primeira, e o paciente perderia o
        // registro sem erro nenhum. Por isso a chave é o `client_key`,
        // gerado no aparelho.
        //
        // O discriminador é `$ehAgendada` (o mesmo do guarda XOR acima), e
        // NÃO `! empty($data['client_key'])`. São equivalentes depois do
        // guarda, mas acoplar a chave ao `client_key` deixaria o caminho
        // agendado mudar de identidade se o campo aparecesse — e foi
        // exatamente esse o bug do híbrido.
        $chave = $ehAgendada
            ? ['dose_schedule_id' => $data['dose_schedule_id'], 'scheduled_at' => $scheduledAtFormatted]
            : ['client_key' => $data['client_key']];

        $log = DoseLog::updateOrCreate(
            $chave,
            array_merge($data, ['scheduled_at' => $scheduledAtFormatted, 'taken_at' => $takenAtFormatted])
        );

        // Streak (Fase 2, 2026-08-11): só verifica marco (7/30/60) quando
        // esta ação especificamente foi o que completou o dia de hoje —
        // sem essa checagem, marcar qualquer dose como tomada recalcularia
        // o streak e re-disparia o mesmo marco em todo toque, não só no
        // que fecha o dia.
        $milestone = $this->completingTodayMilestone($data, $profile, $calculateStreak, $generateOccurrences);

        return response()->json(array_merge($log->toArray(), [
            // Bug de fuso horário (2026-09-09, ver DoseLog::scheduledAtInTimezone/
            // takenAtInTimezone) — sobrescreve o que `$log->toArray()` já
            // devolveu rotulado errado (UTC do app, não o do perfil).
            // P4: a dose avulsa não tem `scheduled_at` nem `dose_schedule`.
            // Sem o `?->`, o `toISOString()` em cima de `null` estouraria
            // a tela inteira — a dose de resgate é justamente a mais
            // provável de ser registrada offline, ou seja, no caminho em
            // que menos se pode errar.
            'scheduled_at' => $log->scheduledAtInTimezone($profile->timezone)?->toISOString(),
            'taken_at' => $log->takenAtInTimezone($profile->timezone)?->toISOString(),
            'medication' => $log->medication->only(['id', 'name', 'dosage', 'unit', 'color', 'is_prn']),
            'dose_schedule' => $log->doseSchedule?->only(['id', 'time', 'days_of_week']),
            'streak_milestone' => $milestone,
        ]), 201);
    }

    private function completingTodayMilestone(array $data, Profile $profile, CalculateAdherenceStreak $calculateStreak, GenerateScheduleOccurrences $generateOccurrences): ?int
    {
        if ($data['status'] !== 'taken') {
            return null;
        }

        $today = Carbon::today($profile->timezone);
        // P4: a dose de resgate não tem `scheduled_at`, e não tem como
        // "completar o dia" — ela não estava prevista em nenhum horário.
        // E o marco de streak é sobre concluir o que foi PLANEJADO, que
        // é exatamente o denominador que o PRN não toca (D13). Sem este
        // early return, o `parse(null)` de baixo estouraria o 500 no
        // registro de uma dose de resgate.
        if (empty($data['scheduled_at'])) {
            return null;
        }

        if (! Carbon::parse($data['scheduled_at'])->isSameDay($today)) {
            return null;
        }

        // "Frequência de horário" (2026-08-14): um schedule pode ter mais
        // de uma dose devida hoje agora — conta ocorrências, não
        // schedules, senão "completar o dia" dispararia cedo demais pra
        // quem tem remédio de intervalo.
        // Mesmo achado de CalculateAdherenceStreak (2026-09-12): sem
        // filtro de pausado, GenerateScheduleOccurrences decide pelo
        // instante de `paused_at`.
        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true))
            ->with('medication:id,is_paused,paused_at')
            ->get();

        $dueScheduleIds = [];
        $totalDue = 0;
        foreach ($schedules as $schedule) {
            $occurrenceCount = count($generateOccurrences->handle($schedule, $today));
            if ($occurrenceCount > 0) {
                $dueScheduleIds[] = $schedule->id;
                $totalDue += $occurrenceCount;
            }
        }

        if ($totalDue === 0) {
            return null;
        }

        $takenToday = DoseLog::whereIn('dose_schedule_id', $dueScheduleIds)
            ->whereDate('scheduled_at', $today)
            ->where('status', 'taken')
            ->count();

        if ($takenToday < $totalDue) {
            return null; // ainda falta dose hoje — não é a ação que completou o dia
        }

        $streak = $calculateStreak->handle($profile);

        return in_array($streak['current_streak'], [7, 30, 60], true) ? $streak['current_streak'] : null;
    }

    public function streak(Request $request, Profile $profile, CalculateAdherenceStreak $calculateStreak): JsonResponse
    {
        Gate::authorize('view', $profile);

        return response()->json($calculateStreak->handle($profile));
    }

    /**
     * "Corrigir dose" (Fase 1 do roadmap) — desmarcar um "Tomei"/"Pulei"
     * feito por engano. Não tem status "voltar pra pendente" no banco:
     * apagar o log é o próprio "voltar a pendente", porque today() já
     * trata ausência de log como pending_<scheduleId>.
     */
    public function destroy(Request $request, DoseLog $doseLog): JsonResponse
    {
        Gate::authorize('delete', $doseLog);

        $doseLog->delete();

        return response()->json(null, 204);
    }

    // "Reação do cuidador" (2026-08-22) — 1 toque pra reagir a uma dose
    // já tomada, sem virar chat. Ver ReactToDoseLog pra regra de quem é
    // notificado.
    /**
     * Editar **só** a nota da dose (P3, 2026-09-25).
     *
     * Rota dedicada em vez de reenviar pro `store` — e o motivo é de
     * integridade, não de elegância. O `store` é `updateOrCreate` na chave
     * `(dose_schedule_id, scheduled_at)`, ou seja, "editar a nota"
     * significaria reenviar a dose INTEIRA: o cliente teria que reenviar
     * `taken_at` e `status` (ambos `required` na validação), e qualquer
     * imprecisão ali **reescreve o registro da dose** para salvar um
     * campo de texto. Pior, o `store` dispara a verificação de marco de
     * streak, que podia comemorar de novo um marco já-deleteado.
     *
     * Aqui só `notes` é tocável. `taken_at` e `status` ficam
     * estruturalmente fora do alcance, então não há como degradar a dose
     * por causa de uma nota.
     */
    public function updateNote(Request $request, DoseLog $doseLog): JsonResponse
    {
        Gate::authorize('update', $doseLog);

        $data = $request->validate([
            // `nullable` e não `required`: apagar a nota é uma ação
            // legítima, e `max:500` é o mesmo teto do `store` — um
            // registro não pode ter um limite e o outro não.
            'notes' => 'nullable|string|max:500',
        ]);

        $doseLog->update(['notes' => $data['notes'] !== null ? $data['notes'] : null]);

        return response()->json($doseLog->fresh());
    }

    public function react(Request $request, DoseLog $doseLog, ReactToDoseLog $reactToDoseLog): JsonResponse
    {
        Gate::authorize('react', $doseLog);

        $reactToDoseLog->handle($doseLog, $request->user());

        return response()->json($doseLog->fresh(['reactedBy']));
    }

    // "Gráfico de adesão" (Fase 2, 2026-08-13) — reaproveita
    // CalculateWeeklyAdherence (já existia pro resumo semanal), uma
    // chamada por semana. Mesmo limite de dias do histórico
    // (history() acima) — grátis vê ~4 semanas, Pro vê até 8 (2 meses,
    // o que o roadmap pedia). É o mesmo paywall que já existe, não um
    // novo — só aplicado aqui também, pra não abrir uma segunda forma
    // de ver mais histórico do que o plano permite.
    // "Resumo pra consulta" (2026-08-23) — mesmo paywall de profundidade
    // de histórico que weeklyAdherence já usa (30 dias grátis, mais só
    // Pro), mas o teto aqui é 90 mesmo pra Pro: mais que isso não serve
    // pra uma consulta médica de verdade, é histórico de uso.
    public function consultationSummary(Request $request, Profile $profile, GenerateConsultationSummary $generateSummary): JsonResponse
    {
        Gate::authorize('view', $profile);

        $requested = (int) $request->query('days', 30);
        $maxDays = $request->user()->isPro() ? 90 : 30;
        $days = max(1, min($requested, $maxDays));

        // Filtro opcional por medicamento (2026-09-08, item 16) — sem
        // validar que pertence ao perfil de propósito: a query em
        // GenerateConsultationSummary já escopa por profile_id junto,
        // um id de outro perfil simplesmente não bate em nada (resumo
        // vazio), não vaza dado de ninguém.
        $medicationId = $request->query('medication_id') !== null
            ? (int) $request->query('medication_id')
            : null;

        return response()->json($generateSummary->handle($profile, $days, $medicationId));
    }

    public function weeklyAdherence(Request $request, Profile $profile, CalculateWeeklyAdherence $calculateAdherence): JsonResponse
    {
        Gate::authorize('view', $profile);

        // T1 (2026-09-25): o gráfico é leitura do registro da própria
        // pessoa, então o teto de janela não é mais coisa de plano.
        // Antes, `isPro()` aqui só escolhia entre 4 e 8 semanas — e o
        // `min(..., 8)` já limitava o Pro a 8 de qualquer jeito, ou
        // seja, a diferença era densidade de apresentação, não acesso a
        // dado. Agora todo mundo vê as 8 semanas.
        $weeks = 8;

        $today = Carbon::today($profile->timezone);
        $points = [];

        for ($i = $weeks - 1; $i >= 0; $i--) {
            $weekEnd = $today->copy()->subWeeks($i);
            $data = $calculateAdherence->handle($profile, $weekEnd);
            $points[] = [
                'week_start' => $weekEnd->copy()->subDays(6)->toDateString(),
                'week_end' => $weekEnd->toDateString(),
                'percentage' => $data['percentage'],
                'taken' => $data['taken'],
                'due' => $data['due'],
            ];
        }

        return response()->json($points);
    }

    // "Calendário de adesão" (v1.3, aprovado 2026-09-02) — um dia por
    // linha (não uma semana agregada), pro app pintar verde/amarelo/
    // vermelho em cada dia do mês. `?month=AAAA-MM` opcional, mês atual
    // (no fuso do perfil) por padrão. O teto de profundidade deixou de
    // ser coisa de plano em 2026-09-25 (T1) — antes era o mesmo do
    // weeklyAdherence e existia pra "não abrir uma segunda forma de ver
    // mais histórico do que o plano permitia". Agora o clamp é só o piso
    // técnico de `HISTORY_FLOOR_DAYS`: mês além disso cai no mês mais
    // antigo que ainda cabe nele.
    public function dailyAdherence(Request $request, Profile $profile, CalculateDailyAdherence $calculateDaily): JsonResponse
    {
        Gate::authorize('view', $profile);

        $today = Carbon::today($profile->timezone);
        $month = $request->query('month')
            ? Carbon::parse($request->query('month').'-01', $profile->timezone)
            : $today->copy()->startOfMonth();

        // T1 (2026-09-25): o calendário de adesão é leitura do registro
        // da própria pessoa. Antes o `isPro()` aqui servia só de clamp
        // para o mês mais antigo que o plano permitia — grátis não
        // rolava para trás de 30 dias. Rolar o próprio histórico para
        // trás não é Premium, é não perder o próprio dado.
        $earliestAllowed = $today->copy()
            ->subDays(self::HISTORY_FLOOR_DAYS)
            ->startOfMonth();
        if ($month->lt($earliestAllowed)) {
            $month = $earliestAllowed;
        }

        $monthEnd = $month->copy()->endOfMonth();
        if ($monthEnd->gt($today)) {
            $monthEnd = $today->copy();
        }

        // Mesmo achado de CalculateAdherenceStreak (2026-09-12): sem
        // filtro de pausado, GenerateScheduleOccurrences decide pelo
        // instante de `paused_at`.
        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true))
            ->with('medication:id,is_paused,paused_at')
            ->get(['id', 'medication_id', 'time', 'days_of_week', 'interval_hours']);

        $days = [];
        for ($date = $month->copy(); $date->lte($monthEnd); $date->addDay()) {
            $data = $calculateDaily->handle($profile, $date->copy(), $schedules);
            $days[] = [
                'date' => $date->toDateString(),
                'taken' => $data['taken'],
                'due' => $data['due'],
                'percentage' => $data['percentage'],
            ];
        }

        return response()->json($days);
    }
}
