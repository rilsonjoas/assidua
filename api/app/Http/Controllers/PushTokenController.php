<?php

namespace App\Http\Controllers;

use App\Models\PushToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushTokenController extends Controller
{
    // updateOrCreate por token, não por user_id — um token só pode
    // pertencer a um device físico; se o mesmo device trocar de conta
    // (logout/login com outro usuário), o token muda de dono aqui.
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => 'required|string',
            'platform' => 'sometimes|string|in:ios,android,unknown',
        ]);

        $pushToken = PushToken::updateOrCreate(
            ['token' => $data['token']],
            [
                'user_id' => $request->user()->id,
                'platform' => $data['platform'] ?? 'unknown',
                'last_used_at' => now(),
            ]
        );

        return response()->json($pushToken, 201);
    }
}
