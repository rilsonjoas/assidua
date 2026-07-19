<?php

namespace App\Http\Controllers;

use App\Models\DoseLog;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DoseLogController extends Controller
{
    public function today(Request $request, Profile $profile): JsonResponse
    {
        abort_if($profile->user_id !== $request->user()->id, 403);

        $today = Carbon::today();
        $dayOfWeek = (int) $today->dayOfWeek; // 0 = domingo, 6 = sábado

        $medications = $profile->medications()
            ->with(['schedules' => fn ($q) => $q->where('is_active', true)])
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

                $doses[] = [
                    'id' => $log?->id ?? 'pending_' . $schedule->id,
                    'dose_schedule_id' => $schedule->id,
                    'medication_id' => $medication->id,
                    'profile_id' => $profile->id,
                    'scheduled_at' => $scheduledAt->toISOString(),
                    'taken_at' => $log?->taken_at,
                    'status' => $log?->status ?? 'pending',
                    'notes' => $log?->notes,
                    'medication' => $medication->only(['id', 'name', 'dosage', 'unit', 'color']),
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
        abort_if($profile->user_id !== $request->user()->id, 403);

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
        abort_if($profile->user_id !== $request->user()->id, 403);

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
}
