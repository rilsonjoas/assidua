<?php

namespace App\Http\Controllers;

use App\Mail\MagicLinkMail;
use App\Models\LoginLink;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Facades\Socialite;

class AuthController extends Controller
{
    // Login sem senha (2026-08-14) — decisão do Rilson: conta local fica
    // (junto com Google, nunca só um — ver README), mas sem senha pra
    // esquecer/vazar/reutilizar. Um endpoint só serve login E cadastro:
    // e-mail de conta existente manda link de acesso; e-mail novo exige
    // `name` e cria a conta na hora (fica pendente até o link ser
    // clicado no sentido prático — a conta já existe, só não tem sessão
    // ainda). E-mail já cadastrado ignora `name` enviado e manda link
    // pra conta existente — evita o clássico erro confuso de "e-mail já
    // cadastrado" quando a pessoa só queria voltar a entrar.
    public function requestMagicLink(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'name' => 'nullable|string|max:255',
            // Web (W1, 2026-08-22): origem do SPA pra o link de e-mail
            // voltar pra /auth-callback no browser em vez do scheme
            // nativo. Validado contra allowlist AQUI e DE NOVO no
            // redirect — sem isso, quem pede um link pro e-mail de
            // outra pessoa escolheria pra onde o token dela vai.
            'redirect_origin' => ['nullable', 'string', function (string $attribute, mixed $value, \Closure $fail) {
                if (! in_array($value, self::allowedWebOrigins(), true)) {
                    $fail('Origem de redirect não autorizada.');
                }
            }],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user) {
            if (empty($data['name'])) {
                throw ValidationException::withMessages([
                    'email' => ['Não encontramos uma conta com esse e-mail.'],
                ]);
            }

            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => null,
            ]);

            // Achado real (2026-08-14): sem isto, toda conta nova cai na
            // tela "Nenhum perfil criado" — mesmo sendo o caso normal (a
            // pessoa gerenciando o próprio tratamento). Perfil
            // compartilhado com outra pessoa continua existindo (Fase
            // 1.5), isto só cobre o primeiro perfil óbvio: o do próprio
            // dono da conta.
            $this->createDefaultProfile($user);
        }

        // Só um link ativo por vez — pedir de novo invalida o anterior,
        // evita confusão de "qual link eu uso" se a pessoa tocar em
        // pedir 2x (ex.: e-mail demorou, achou que não funcionou).
        LoginLink::where('user_id', $user->id)->whereNull('used_at')->delete();

        $plainToken = Str::random(64);
        LoginLink::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => now()->addMinutes(15),
        ]);

        Mail::to($user->email)->send(new MagicLinkMail($user, $plainToken, $data['redirect_origin'] ?? null));

        return response()->json(['message' => 'Link de acesso enviado pro seu e-mail.']);
    }

    // Allowlist de origens web autorizadas a receber o redirect do link
    // de acesso (e futuramente outros fluxos que devolvem token pro
    // browser). Config em WEB_AUTH_ORIGINS, separada por vírgula.
    public static function allowedWebOrigins(): array
    {
        return array_values(array_filter(array_map(
            'trim',
            explode(',', (string) config('services.web_auth_origins')),
        )));
    }

    // GET porque é o destino de um clique em link de e-mail, não de uma
    // chamada de API do app. Mesmo formato de redirect de deep link que
    // googleCallback() já usa — o app não precisa saber a diferença
    // entre "voltou do Google" e "voltou do link de e-mail", chega tudo
    // pela mesma tela (auth-callback.tsx).
    public function magicLinkRedirect(Request $request): mixed
    {
        $data = $request->validate([
            'token' => 'required|string',
            'origin' => ['nullable', 'string', function (string $attribute, mixed $value, \Closure $fail) {
                if (! in_array($value, self::allowedWebOrigins(), true)) {
                    $fail('Origem de redirect não autorizada.');
                }
            }],
        ]);

        $link = LoginLink::where('token_hash', hash('sha256', $data['token']))
            ->whereNull('used_at')
            ->where('expires_at', '>=', now())
            ->first();

        if (! $link) {
            return response()->view('auth.magic-link-invalid', [], 410);
        }

        $link->update(['used_at' => now()]);
        $user = $link->user;

        $user->tokens()->delete();
        $token = $user->createToken('mobile')->plainTextToken;

        // Mesmo contrato de params do deep link nativo — a rota
        // /auth-callback do SPA (e a tela nativa) consomem os dois iguais.
        $query = http_build_query([
            'token' => $token,
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'subscription_tier' => $user->subscription_tier ?? 'free',
        ]);

        // Web: origem veio no link do e-mail (validada na criação E aqui,
        // contra a mesma allowlist). Nativo: scheme do app, como sempre.
        if (! empty($data['origin'])) {
            return redirect(rtrim($data['origin'], '/').'/auth-callback?'.$query);
        }

        return redirect('meusremedios://auth-callback?'.$query);
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

        $query = http_build_query([
            'token' => $token,
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'subscription_tier' => $user->subscription_tier ?? 'free',
        ]);

        $state = $request->get('state', '');

        // Web (W1, 2026-08-22): origem http(s) autorizada → devolve pra
        // rota /auth-callback da SPA (mesmo contrato de params nativo).
        // ANTES deste ramo existir, web caía no json() logo abaixo — o
        // Rilson recebia o TOKEN CRU renderizado como página.
        if (in_array(rtrim($state, '/'), self::allowedWebOrigins(), true)) {
            return redirect($state.'/auth-callback?'.$query);
        }

        // Fluxo mobile: redireciona para deep link com token
        if (str_starts_with($state, 'meusremedios://')) {
            return redirect($state.'?'.$query);
        }

        // SEM destino válido, NUNCA devolver token em corpo JSON aberto
        // (vazamento real visto em produção). Clientes API/testes que
        // falam JSON continuam suportados via content negotiation.
        if ($request->expectsJson()) {
            return response()->json(['user' => $user, 'token' => $token]);
        }

        abort(400, 'Login com Google sem destino de retorno válido.');
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
