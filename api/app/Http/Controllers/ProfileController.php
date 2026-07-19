<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $profiles = $request->user()->profiles()->with(['medications.stock'])->get();

        return response()->json($profiles);
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
        $this->authorizeProfile($request, $profile);

        return response()->json($profile->load(['medications.schedules', 'medications.stock']));
    }

    public function update(Request $request, Profile $profile): JsonResponse
    {
        $this->authorizeProfile($request, $profile);

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
        $this->authorizeProfile($request, $profile);
        $profile->delete();

        return response()->json(null, 204);
    }

    private function authorizeProfile(Request $request, Profile $profile): void
    {
        abort_if($profile->user_id !== $request->user()->id, 403);
    }
}
