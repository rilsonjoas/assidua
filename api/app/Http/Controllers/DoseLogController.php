<?php

namespace App\Http\Controllers;

use App\Actions\CalculateAdherenceStreak;
use App\Actions\CalculateDailyAdherence;
use App\Actions\CalculateWeeklyAdherence;
use App\Actions\GenerateConsultationSummary;
use App\Actions\GenerateScheduleOccurrences;
use App\Actions\MarkDoseMissedAndNotifyCollaborators;
use App\Actions\ReactToDoseLog;
use App\Models\DoseLog;
use App\Models\DoseSchedule;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class DoseLogController extends Controller
{
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
            // Pausado (2026-08-12): visível na tela Remédios, mas não
            // gera dose nem entra na tela Hoje enquanto estiver pausado.
            ->where('is_paused', false)
            ->get();

        $doses = [];

        foreach ($medications as $medication) {
            foreach ($medication->schedules as $schedule) {
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
                    if (! $log && $scheduledAt->isPast()) {
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

    public function history(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('view', $profile);

        $days = $request->user()->isPro() ? 3650 : 30;

        // Achado 2026-09-09 (mesma auditoria do bug de fuso do
        // taken_at/scheduled_at): `now()` sozinho monta o corte em UTC,
        // mas `scheduled_at` no banco é hora LOCAL do perfil sem fuso —
        // comparar os dois direto desloca a janela de "últimos N dias"
        // pelo offset do perfil (podia cortar/incluir até ~algumas horas
        // erradas na borda). `Carbon::now($profile->timezone)` garante
        // que o corte é calculado no mesmo referencial dos dados.
        $cutoff = Carbon::now($profile->timezone)->subDays($days)->format('Y-m-d H:i:s');

        $query = $profile->doseLogs()
            ->with(['medication', 'doseSchedule'])
            ->where('scheduled_at', '>=', $cutoff);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('medication_id')) {
            $query->where('medication_id', $request->medication_id);
        }

        if ($request->filled('date_from')) {
            $query->whereDate('scheduled_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('scheduled_at', '<=', $request->date_to);
        }

        $logs = $query->orderBy('scheduled_at', 'desc')->paginate(50);

        // Bug de fuso horário (2026-09-09, ver DoseLog::scheduledAtInTimezone/
        // takenAtInTimezone) — a serialização automática do Eloquent aqui
        // rotulava os dois campos com o fuso errado (UTC do app, não o do
        // perfil), 3h+ adiantado/atrasado do horário real pra perfil fora
        // de UTC. `through()` remapeia os itens da página sem perder os
        // metadados de paginação (current_page, last_page, etc.).
        $logs = $logs->through(fn (DoseLog $log) => [
            ...$log->toArray(),
            'scheduled_at' => $log->scheduledAtInTimezone($profile->timezone)->toISOString(),
            'taken_at' => $log->takenAtInTimezone($profile->timezone)?->toISOString(),
        ]);

        return response()->json($logs);
    }

    public function store(Request $request, CalculateAdherenceStreak $calculateStreak, GenerateScheduleOccurrences $generateOccurrences): JsonResponse
    {
        $data = $request->validate([
            'dose_schedule_id' => 'required|exists:dose_schedules,id',
            'medication_id' => 'required|exists:medications,id',
            'profile_id' => 'required|exists:profiles,id',
            'scheduled_at' => 'required|date',
            'taken_at' => 'nullable|date',
            'status' => 'required|in:taken,skipped,missed',
            'notes' => 'nullable|string|max:500',
        ]);

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
        $schedule = DoseSchedule::whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id))
            ->findOrFail($data['dose_schedule_id']);
        abort_unless($schedule->medication_id === (int) $data['medication_id'], 404);

        $scheduledAtFormatted = Carbon::parse($data['scheduled_at'])->setTimezone($profile->timezone)->format('Y-m-d H:i:s');

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

        $log = DoseLog::updateOrCreate(
            [
                'dose_schedule_id' => $data['dose_schedule_id'],
                'scheduled_at' => $scheduledAtFormatted,
            ],
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
            'scheduled_at' => $log->scheduledAtInTimezone($profile->timezone)->toISOString(),
            'taken_at' => $log->takenAtInTimezone($profile->timezone)?->toISOString(),
            'medication' => $log->medication->only(['id', 'name', 'dosage', 'unit', 'color']),
            'dose_schedule' => $log->doseSchedule->only(['id', 'time', 'days_of_week']),
            'streak_milestone' => $milestone,
        ]), 201);
    }

    private function completingTodayMilestone(array $data, Profile $profile, CalculateAdherenceStreak $calculateStreak, GenerateScheduleOccurrences $generateOccurrences): ?int
    {
        if ($data['status'] !== 'taken') {
            return null;
        }

        $today = Carbon::today($profile->timezone);
        if (! Carbon::parse($data['scheduled_at'])->isSameDay($today)) {
            return null;
        }

        // "Frequência de horário" (2026-08-14): um schedule pode ter mais
        // de uma dose devida hoje agora — conta ocorrências, não
        // schedules, senão "completar o dia" dispararia cedo demais pra
        // quem tem remédio de intervalo.
        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true)->where('is_paused', false))
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

        $maxDays = $request->user()->isPro() ? 3650 : 30;
        $weeks = min((int) floor($maxDays / 7), 8);

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
    // (no fuso do perfil) por padrão. Mesmo teto de profundidade do
    // weeklyAdherence (30 dias grátis) — não abre uma segunda forma de
    // ver mais histórico do que o plano permite; mês fora da janela
    // permitida cai pro mês mais antigo que ainda cabe nela.
    public function dailyAdherence(Request $request, Profile $profile, CalculateDailyAdherence $calculateDaily): JsonResponse
    {
        Gate::authorize('view', $profile);

        $today = Carbon::today($profile->timezone);
        $month = $request->query('month')
            ? Carbon::parse($request->query('month').'-01', $profile->timezone)
            : $today->copy()->startOfMonth();

        $maxDays = $request->user()->isPro() ? 3650 : 30;
        $earliestAllowed = $today->copy()->subDays($maxDays)->startOfMonth();
        if ($month->lt($earliestAllowed)) {
            $month = $earliestAllowed;
        }

        $monthEnd = $month->copy()->endOfMonth();
        if ($monthEnd->gt($today)) {
            $monthEnd = $today->copy();
        }

        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true)->where('is_paused', false))
            ->get(['id', 'time', 'days_of_week', 'interval_hours']);

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
