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
            // Achado real (2026-08-14): campo se chama "emoji" mas guarda
            // nome de ícone do MaterialCommunityIcons (ex.: 17 caracteres
            // em `baby-face-outline`) — max:10 rejeitava a maioria dos
            // ícones da própria lista de seleção do app. Ver migration
            // `widen_avatar_emoji_on_profiles_table` pro mesmo ajuste na
            // coluna.
            'avatar_emoji' => 'sometimes|string|max:40',
            // Achado 2026-08-10: sem isto, todo perfil calculava "hoje" em
            // UTC. Mandado pelo app a partir do dispositivo; se o cliente
            // não mandar (versão antiga do app), fica no default da
            // coluna (America/Sao_Paulo) — não quebra, só não corrige.
            'timezone' => 'sometimes|timezone',
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
            // Achado real (2026-08-14): campo se chama "emoji" mas guarda
            // nome de ícone do MaterialCommunityIcons (ex.: 17 caracteres
            // em `baby-face-outline`) — max:10 rejeitava a maioria dos
            // ícones da própria lista de seleção do app. Ver migration
            // `widen_avatar_emoji_on_profiles_table` pro mesmo ajuste na
            // coluna.
            'avatar_emoji' => 'sometimes|string|max:40',
            'is_active' => 'sometimes|boolean',
            'timezone' => 'sometimes|timezone',
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
