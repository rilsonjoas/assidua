<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        // Achado real (2026-08-14): sem isto, toda conta nova cai na tela
        // "Nenhum perfil criado" — mesmo sendo o caso normal (a pessoa
        // gerenciando o próprio tratamento). Perfil compartilhado com
        // outra pessoa continua existindo (Fase 1.5), isto só cobre o
        // primeiro perfil óbvio: o do próprio dono da conta.
        $this->createDefaultProfile($user);

        $token = $user->createToken('mobile')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Credenciais inválidas.'],
            ]);
        }

        $user->tokens()->delete();
        $token = $user->createToken('mobile')->plainTextToken;

        return response()->json(['user' => $user, 'token' => $token]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logout realizado com sucesso.']);
    }

    public function destroyAccount(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->password !== null) {
            $request->validate(['password' => 'required|string']);

            if (! Hash::check($request->input('password'), $user->password)) {
                throw ValidationException::withMessages([
                    'password' => ['Senha incorreta.'],
                ]);
            }
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Conta excluída com sucesso.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->load('profiles'));
    }

    public function googleRedirect(Request $request): \Symfony\Component\HttpFoundation\RedirectResponse
    {
        $driver = Socialite::driver('google')->stateless();

        if ($request->filled('return_url')) {
            $driver = $driver->with(['state' => $request->return_url]);
        }

        return $driver->redirect();
    }

    public function googleCallback(Request $request): mixed
    {
        $googleUser = Socialite::driver('google')->stateless()->user();

        $user = User::updateOrCreate(
            ['google_id' => $googleUser->getId()],
            [
                'name' => $googleUser->getName(),
                'email' => $googleUser->getEmail(),
                'avatar_url' => $googleUser->getAvatar(),
                'email_verified_at' => now(),
            ]
        );

        // wasRecentlyCreated só é true na mesma requisição que inseriu a
        // linha — próximos logins do mesmo google_id não recriam o perfil.
        if ($user->wasRecentlyCreated) {
            $this->createDefaultProfile($user);
        }

        $user->tokens()->delete();
        $token = $user->createToken('mobile')->plainTextToken;

        // Fluxo mobile: redireciona para deep link com token
        $state = $request->get('state', '');
        if (str_starts_with($state, 'meusremedios://')) {
            return redirect($state . '?' . http_build_query([
                'token' => $token,
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'subscription_tier' => $user->subscription_tier ?? 'free',
            ]));
        }

        return response()->json(['user' => $user, 'token' => $token]);
    }

    // 'account' é o mesmo ícone que o formulário de criação de perfil no
    // mobile já usa como padrão (`useState(...'account')` em profile.tsx)
    // — mantém consistência com o que a pessoa veria se criasse na mão.
    private function createDefaultProfile(User $user): void
    {
        $user->profiles()->create([
            'name' => $user->name,
            'avatar_emoji' => 'account',
        ]);
    }
}
