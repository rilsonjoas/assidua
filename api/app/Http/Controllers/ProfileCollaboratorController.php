<?php

namespace App\Http\Controllers;

use App\Models\Profile;
use App\Models\ProfileCollaborator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ProfileCollaboratorController extends Controller
{
    // Alfabeto sem 0/O/1/I/l — código pode precisar ser digitado (código
    // ditado por telefone, por exemplo), ambiguidade aí é fricção real.
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function index(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('update', $profile);

        return response()->json(
            $profile->collaborators()->with('user:id,name,email')->latest()->get()
        );
    }

    public function store(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('update', $profile);

        $collaborator = $profile->collaborators()->create([
            'invited_by_user_id' => $request->user()->id,
            'role' => 'viewer',
            'invite_code' => $this->generateUniqueCode(),
            'expires_at' => now()->addDays(7),
        ]);

        return response()->json($collaborator, 201);
    }

    public function destroy(Request $request, Profile $profile, ProfileCollaborator $collaborator): JsonResponse
    {
        Gate::authorize('update', $profile);
        abort_if($collaborator->profile_id !== $profile->id, 404);

        $collaborator->delete();

        return response()->json(null, 204);
    }

    // Rota solta (não aninhada em /profiles/{profile}) — quem resgata
    // não é dono do perfil, então não faz sentido exigir o profile_id
    // na URL; o código já identifica o convite.
    public function accept(Request $request, string $code): JsonResponse
    {
        $invite = ProfileCollaborator::where('invite_code', $code)->pending()->first();

        abort_if(! $invite, 404, 'Convite não encontrado ou já usado.');
        abort_if($invite->expires_at && $invite->expires_at->isPast(), 410, 'Convite expirado — peça um novo.');

        $user = $request->user();
        $profile = $invite->profile;

        abort_if($profile->user_id === $user->id, 422, 'Você já é dono deste perfil.');

        $alreadyCollaborator = ProfileCollaborator::where('profile_id', $profile->id)
            ->where('user_id', $user->id)
            ->accepted()
            ->exists();
        abort_if($alreadyCollaborator, 422, 'Você já tem acesso a este perfil.');

        $invite->update([
            'user_id' => $user->id,
            'invite_code' => null,
            'expires_at' => null,
            'accepted_at' => now(),
        ]);

        return response()->json($profile->only(['id', 'name', 'color', 'avatar_emoji']));
    }

    private function generateUniqueCode(): string
    {
        // Str::random() não aceita alfabeto customizado nesta versão do
        // Laravel — sorteio manual pra evitar caracteres ambíguos.
        do {
            $code = '';
            for ($i = 0; $i < 8; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (ProfileCollaborator::where('invite_code', $code)->exists());

        return $code;
    }
}
