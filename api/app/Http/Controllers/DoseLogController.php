<?php

namespace App\Http\Controllers;

use App\Actions\CalculateAdherenceStreak;
use App\Actions\CalculateWeeklyAdherence;
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

                foreach ($occurrences as $scheduledAt) {
                    // Busca log existente para esta ocorrência específica
                    // (horário exato, não só o dia — com múltiplas doses
                    // por dia, "o log de hoje" deixou de identificar uma
                    // ocorrência sozinho).
                    $log = DoseLog::where('dose_schedule_id', $schedule->id)
                        ->where('scheduled_at', $scheduledAt->format('Y-m-d H:i:s'))
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

                    $doses[] = [
                        // Sufixo HHmm no id pendente: com múltiplas ocorrências
                        // do mesmo schedule no dia, "pending_<scheduleId>"
                        // sozinho colidiria entre elas.
                        'id' => $log?->id ?? 'pending_' . $schedule->id . '_' . $scheduledAt->format('Hi'),
                        'dose_schedule_id' => $schedule->id,
                        'medication_id' => $medication->id,
                        'profile_id' => $profile->id,
                        'scheduled_at' => $scheduledAt->toISOString(),
                        'taken_at' => $log?->taken_at,
                        'status' => $log?->status ?? 'pending',
                        'notes' => $log?->notes,
                        'medication' => $medication->only(['id', 'name', 'dosage', 'unit', 'color', 'days_remaining']),
                        'dose_schedule' => $schedule->only(['id', 'time', 'days_of_week', 'interval_hours']),
                    ];
                }
            }
        }

        // Ordena por horário
        usort($doses, fn ($a, $b) => strcmp($a['scheduled_at'], $b['scheduled_at']));

        return response()->json($doses);
    }

    public function history(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('view', $profile);

        $days = $request->user()->isPro() ? 3650 : 30;

        $query = $profile->doseLogs()
            ->with(['medication', 'doseSchedule'])
            ->where('scheduled_at', '>=', now()->subDays($days));

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

        $log = DoseLog::updateOrCreate(
            [
                'dose_schedule_id' => $data['dose_schedule_id'],
                'scheduled_at' => Carbon::parse($data['scheduled_at'])->format('Y-m-d H:i:s'),
            ],
            $data
        );

        // Streak (Fase 2, 2026-08-11): só verifica marco (7/30/60) quando
        // esta ação especificamente foi o que completou o dia de hoje —
        // sem essa checagem, marcar qualquer dose como tomada recalcularia
        // o streak e re-disparia o mesmo marco em todo toque, não só no
        // que fecha o dia.
        $milestone = $this->completingTodayMilestone($data, $profile, $calculateStreak, $generateOccurrences);

        return response()->json(array_merge($log->toArray(), [
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
}
