<?php

namespace App\Http\Controllers;

use App\Models\Medication;
use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class MedicationController extends Controller
{
    public function index(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('view', $profile);

        $medications = $profile->medications()
            ->with(['schedules', 'stock'])
            ->where('is_active', true)
            ->get();

        return response()->json($medications);
    }

    public function store(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('view', $profile);

        $user = $request->user();

        if (! $user->isPro() && $profile->medications()->where('is_active', true)->count() >= 15) {
            return response()->json([
                'message' => 'Limite de 15 medicamentos por perfil no plano gratuito. Faça upgrade para o Pro.',
            ], 403);
        }

        $data = $request->validate([
            'name' => 'required|string|max:150',
            'dosage' => 'required|string|max:50',
            'unit' => 'sometimes|string|max:30',
            'color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'instructions' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $medication = $profile->medications()->create($data);

        $medication->stock()->create([
            'unit' => $data['unit'] ?? 'comprimidos',
        ]);

        return response()->json($medication->load(['schedules', 'stock']), 201);
    }

    public function show(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('view', $medication);

        return response()->json($medication->load(['schedules', 'stock']));
    }

    public function update(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('update', $medication);

        $data = $request->validate([
            'name' => 'sometimes|string|max:150',
            'dosage' => 'sometimes|string|max:50',
            'unit' => 'sometimes|string|max:30',
            'color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'instructions' => 'nullable|string',
            'notes' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ]);

        $medication->update($data);

        return response()->json($medication->load(['schedules', 'stock']));
    }

    public function destroy(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('delete', $medication);
        $medication->delete();

        return response()->json(null, 204);
    }
}
