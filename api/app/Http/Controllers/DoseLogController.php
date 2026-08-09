<?php

namespace App\Http\Controllers;

use App\Models\DoseLog;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class DoseLogController extends Controller
{
    public function today(Request $request, Profile $profile): JsonResponse
    {
        // Fase 1.5 (2026-08-09): abort_if direto virou Gate::authorize —
        // ProfilePolicy::view agora também aceita colaborador aceito, não
        // só dono. Sem essa troca, o cuidador remoto nunca conseguiria
        // ver a tela Hoje do paciente.
        Gate::authorize('view', $profile);

        $today = Carbon::today();
        $dayOfWeek = (int) $today->dayOfWeek; // 0 = domingo, 6 = sábado

        $medications = $profile->medications()
            ->with([
                'schedules' => fn ($q) => $q->where('is_active', true),
                'stock',
            ])
            ->where('is_active', true)
            ->get();

        $doses = [];

        foreach ($medications as $medication) {
            foreach ($medication->schedules as $schedule) {
                // Verifica se o horário está ativo hoje (por dias da semana ou intervalo)
                if ($schedule->days_of_week !== null && ! in_array($dayOfWeek, $schedule->days_of_week)) {
                    continue;
                }

                $scheduledAt = Carbon::today()->setTimeFromTimeString($schedule->time);

                // Busca log existente para hoje
                $log = DoseLog::where('dose_schedule_id', $schedule->id)
                    ->whereDate('scheduled_at', $today)
                    ->first();

                // Status automático "Perdido" (Fase 1 do roadmap): dose
                // cujo horário já passou e ninguém agiu vira `missed` —
                // registrado agora (não só calculado na resposta), pra
                // entrar de verdade no histórico/adesão depois. Continua
                // acionável: o usuário ainda pode tocar "Tomei" e
                // sobrescrever (store() já faz updateOrCreate pela
                // mesma chave dose_schedule_id+scheduled_at).
                if (! $log && $scheduledAt->isPast()) {
                    $log = DoseLog::create([
                        'dose_schedule_id' => $schedule->id,
                        'medication_id' => $medication->id,
                        'profile_id' => $profile->id,
                        'scheduled_at' => $scheduledAt,
                        'taken_at' => null,
                        'status' => 'missed',
                    ]);
                }

                $doses[] = [
                    'id' => $log?->id ?? 'pending_' . $schedule->id,
                    'dose_schedule_id' => $schedule->id,
                    'medication_id' => $medication->id,
                    'profile_id' => $profile->id,
                    'scheduled_at' => $scheduledAt->toISOString(),
                    'taken_at' => $log?->taken_at,
                    'status' => $log?->status ?? 'pending',
                    'notes' => $log?->notes,
                    'medication' => $medication->only(['id', 'name', 'dosage', 'unit', 'color', 'days_remaining']),
                    'dose_schedule' => $schedule->only(['id', 'time', 'days_of_week']),
                ];
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

    public function store(Request $request): JsonResponse
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

        return response()->json(array_merge($log->toArray(), [
            'medication' => $log->medication->only(['id', 'name', 'dosage', 'unit', 'color']),
            'dose_schedule' => $log->doseSchedule->only(['id', 'time', 'days_of_week']),
        ]), 201);
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
}
