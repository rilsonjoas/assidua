<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_registra_usuario_com_sucesso(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Rilson',
            'email' => 'rilson@example.com',
            'password' => 'senha1234',
            'password_confirmation' => 'senha1234',
        ]);

        $response->assertCreated()->assertJsonStructure(['user', 'token']);
        $this->assertDatabaseHas('users', ['email' => 'rilson@example.com']);

        $user = User::where('email', 'rilson@example.com')->first();
        $this->assertTrue(Hash::check('senha1234', $user->password));
    }

    public function test_nao_permite_registrar_email_duplicado(): void
    {
        User::factory()->create(['email' => 'duplicado@example.com']);

        $response = $this->postJson('/api/auth/register', [
            'name' => 'Outro',
            'email' => 'duplicado@example.com',
            'password' => 'senha1234',
            'password_confirmation' => 'senha1234',
        ]);

        $response->assertUnprocessable();
        $this->assertSame(1, User::where('email', 'duplicado@example.com')->count());
    }

    public function test_rejeita_senha_curta(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Rilson',
            'email' => 'rilson@example.com',
            'password' => '123',
            'password_confirmation' => '123',
        ]);

        $response->assertUnprocessable();
    }

    public function test_rejeita_senha_sem_confirmacao(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Rilson',
            'email' => 'rilson@example.com',
            'password' => 'senha1234',
        ]);

        $response->assertUnprocessable();
    }

    public function test_login_com_sucesso(): void
    {
        $user = User::factory()->create(['password' => Hash::make('senha1234')]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'senha1234',
        ]);

        $response->assertOk()->assertJsonStructure(['user', 'token']);
    }

    public function test_login_com_senha_errada_retorna_erro_generico(): void
    {
        $user = User::factory()->create(['password' => Hash::make('senha1234')]);

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'senha-errada',
        ]);

        $response->assertUnprocessable();
        $response->assertJsonFragment(['email' => ['Credenciais inválidas.']]);
    }

    public function test_login_com_email_inexistente(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'ninguem@example.com',
            'password' => 'qualquer123',
        ]);

        $response->assertUnprocessable();
    }

    public function test_login_revoga_tokens_anteriores(): void
    {
        $user = User::factory()->create(['password' => Hash::make('senha1234')]);
        $user->createToken('token-antigo');

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'senha1234',
        ])->assertOk();

        $this->assertSame(1, PersonalAccessToken::where('tokenable_id', $user->id)->count());
    }

    public function test_logout_revoga_o_token_usado(): void
    {
        $user = User::factory()->create();
        $newToken = $user->createToken('mobile');

        $this->withHeader('Authorization', "Bearer {$newToken->plainTextToken}")
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $newToken->accessToken->id]);
    }

    public function test_me_retorna_usuario_autenticado_com_perfis(): void
    {
        $user = User::factory()->create();
        $user->profiles()->create(['name' => 'Rilson']);
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me');

        $response->assertOk();
        $response->assertJsonPath('email', $user->email);
        $response->assertJsonCount(1, 'profiles');
    }

    public function test_me_sem_token_retorna_401(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_exclui_a_propria_conta_e_todos_os_dados_associados(): void
    {
        $user = User::factory()->create(['password' => Hash::make('senha1234')]);
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->deleteJson('/api/auth/account', ['password' => 'senha1234']);

        $response->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('profiles', ['id' => $profile->id]);
        $this->assertDatabaseMissing('medications', ['id' => $medication->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_exclusao_de_conta_exige_senha_correta_quando_usuario_tem_senha(): void
    {
        $user = User::factory()->create(['password' => Hash::make('senha1234')]);
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->deleteJson('/api/auth/account', ['password' => 'senha-errada']);

        $response->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_exclui_conta_sem_senha_para_usuario_cadastrado_via_google(): void
    {
        $user = User::factory()->create(['password' => null, 'google_id' => 'google-123']);
        $token = $user->createToken('mobile')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->deleteJson('/api/auth/account');

        $response->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_nao_permite_excluir_conta_sem_autenticacao(): void
    {
        $this->deleteJson('/api/auth/account')->assertUnauthorized();
    }

    public function test_login_e_bloqueado_por_rate_limit_apos_5_tentativas(): void
    {
        $user = User::factory()->create(['password' => Hash::make('senha1234')]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => $user->email,
                'password' => 'senha-errada',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'senha-errada',
        ])->assertStatus(429);
    }

    public function test_register_e_bloqueado_por_rate_limit_apos_5_tentativas(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/register', [
                'name' => "Usuário {$i}",
                'email' => "usuario{$i}@example.com",
                'password' => 'senha1234',
                'password_confirmation' => 'senha1234',
            ])->assertCreated();
        }

        $this->postJson('/api/auth/register', [
            'name' => 'Sexto usuário',
            'email' => 'sexto@example.com',
            'password' => 'senha1234',
            'password_confirmation' => 'senha1234',
        ])->assertStatus(429);
    }
}
