<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ProfileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Fase 1.5, Etapa 5 — lista os próprios perfis + os que o
        // usuário cuida remotamente (colaboração aceita), marcados com
        // is_owner pra o app distinguir na UI (etiqueta "Cuidando de").
        $user = $request->user();

        $owned = $user->profiles()->with(['medications.stock'])->get()
            ->each(fn ($profile) => $profile->is_owner = true);

        $shared = $user->sharedProfiles()->with(['medications.stock'])->get()
            ->each(fn ($profile) => $profile->is_owner = false);

        return response()->json($owned->concat($shared)->values());
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->isPro() && $user->profiles()->count() >= 4) {
            return response()->json([
                'message' => 'Limite de 4 perfis no plano gratuito. Faça upgrade para o Pro.',
            ], 403);
        }

        $data = $request->validate([
            'name' => 'required|string|max:100',
            'color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'avatar_emoji' => 'sometimes|string|max:10',
        ]);

        $profile = $user->profiles()->create($data);

        return response()->json($profile, 201);
    }

    public function show(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('view', $profile);

        return response()->json($profile->load(['medications.schedules', 'medications.stock']));
    }

    public function update(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('update', $profile);

        $data = $request->validate([
            'name' => 'sometimes|string|max:100',
            'color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'avatar_emoji' => 'sometimes|string|max:10',
            'is_active' => 'sometimes|boolean',
        ]);

        $profile->update($data);

        return response()->json($profile);
    }

    public function destroy(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('delete', $profile);
        $profile->delete();

        return response()->json(null, 204);
    }
}
