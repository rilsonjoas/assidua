<?php

namespace App\Http\Controllers;

use App\Models\DoseSchedule;
use App\Models\Medication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class DoseScheduleController extends Controller
{
    public function index(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('view', $medication);

        return response()->json($medication->schedules()->where('is_active', true)->get());
    }

    public function store(Request $request, Medication $medication): JsonResponse
    {
        // Achado real (Fase 1.5, 2026-08-09): isto usava 'view', não
        // 'update'. Antes da introdução de colaborador não fazia
        // diferença (view === update === dono); agora que view() abre
        // pro cuidador, criar horário precisa continuar só do dono.
        Gate::authorize('update', $medication);

        $data = $request->validate([
            'time' => 'required|date_format:H:i',
            'days_of_week' => 'nullable|array',
            'days_of_week.*' => 'integer|between:0,6',
            'interval_hours' => 'nullable|integer|min:1|max:168',
        ]);

        $schedule = $medication->schedules()->create($data);

        return response()->json($schedule, 201);
    }

    public function update(Request $request, DoseSchedule $doseSchedule): JsonResponse
    {
        Gate::authorize('update', $doseSchedule);

        $data = $request->validate([
            'time' => 'sometimes|date_format:H:i',
            'days_of_week' => 'nullable|array',
            'days_of_week.*' => 'integer|between:0,6',
            'interval_hours' => 'nullable|integer|min:1|max:168',
            'is_active' => 'sometimes|boolean',
        ]);

        $doseSchedule->update($data);

        return response()->json($doseSchedule);
    }

    public function destroy(Request $request, DoseSchedule $doseSchedule): JsonResponse
    {
        Gate::authorize('delete', $doseSchedule);
        $doseSchedule->delete();

        return response()->json(null, 204);
    }
}
