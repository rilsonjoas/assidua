<?php

namespace App\Http\Controllers;

use App\Models\Medication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class StockController extends Controller
{
    public function show(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('view', $medication);

        return response()->json($medication->stock()->firstOrCreate([
            'medication_id' => $medication->id,
        ]));
    }

    public function update(Request $request, Medication $medication): JsonResponse
    {
        // manageStock, não update() — reabastecer é ação de cuidador,
        // diferente de editar o cadastro do remédio (Fase 1.5, 2026-08-09).
        Gate::authorize('manageStock', $medication);

        $data = $request->validate([
            'current_quantity' => 'required|numeric|min:0',
            'unit' => 'sometimes|string|max:30',
            'min_alert_quantity' => 'sometimes|numeric|min:0',
        ]);

        $stock = $medication->stock()->updateOrCreate(
            ['medication_id' => $medication->id],
            array_merge($data, ['last_updated_at' => now()])
        );

        return response()->json($stock);
    }
}
