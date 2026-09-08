<?php

namespace App\Http\Controllers;

use App\Actions\GenerateScheduleOccurrences;
use App\Models\DoseSchedule;
use App\Models\Medication;
use Carbon\Carbon;
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

    // "Dose fora do horário + recálculo" (item 8, 2026-09-08) — achado
    // real do Rilson: tomar um remédio "de X em X horas" bem fora do
    // previsto deveria poder deslocar as doses RESTANTES daquele dia
    // (ex.: tomou o das 8h só às 10h → próxima aparece às 18h, não
    // 16h), sem virar o horário permanente. Só faz sentido pra modo
    // intervalo — horário fixo não tem "próxima dose" pra deslocar, só
    // registra atrasado (decisão de produto confirmada, ver roadmap).
    public function recalculateToday(Request $request, DoseSchedule $doseSchedule, GenerateScheduleOccurrences $generateOccurrences): JsonResponse
    {
        Gate::authorize('update', $doseSchedule);

        if ($doseSchedule->interval_hours === null) {
            return response()->json([
                'message' => 'Recalcular a próxima dose só se aplica a horário do tipo "a cada X horas".',
            ], 422);
        }

        // Fuso horário (2026-09-08, achado de auditoria registrado no
        // roadmap) — antes recebia "H:i" nu, montado no fuso do
        // APARELHO de quem confirma o ajuste (`format(anchor, 'HH:mm')`
        // no app, sem conversão nenhuma). Para o dono do perfil isso
        // sempre bate, mas um cuidador remoto em outro fuso enviava um
        // "horário local dele" que o backend guardava como se já fosse
        // o horário do perfil — deslocamento real quando os fusos
        // diferem. Agora recebe o instante absoluto (ISO 8601, com
        // offset) e converte pro fuso do PERFIL aqui, não do aparelho.
        $data = $request->validate([
            'anchor_time' => 'required|date',
        ]);

        $profile = $doseSchedule->medication->profile;
        $today = Carbon::today($profile->timezone);
        $anchorInProfileTimezone = Carbon::parse($data['anchor_time'])->setTimezone($profile->timezone);

        $doseSchedule->update([
            'today_override_date' => $today,
            'today_override_time' => $anchorInProfileTimezone->format('H:i'),
        ]);
        // Um `fresh()` só (achado de revisão de código, 2026-09-08) — os
        // dois usos abaixo liam o mesmo registro duas vezes à toa.
        $fresh = $doseSchedule->fresh();

        return response()->json([
            'schedule' => $fresh,
            // Devolve as ocorrências já recalculadas pra hoje — poupa o
            // client de um segundo round-trip só pra saber o que
            // reagendar como notificação local.
            'today_occurrences' => array_map(
                fn ($occurrence) => $occurrence->toIso8601String(),
                $generateOccurrences->handle($fresh, $today),
            ),
        ]);
    }
}
