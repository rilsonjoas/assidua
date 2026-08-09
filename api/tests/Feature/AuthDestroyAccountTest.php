<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthDestroyAccountTest extends TestCase
{
    use RefreshDatabase;

    public function test_exclui_conta_com_senha_correta_e_apaga_tudo_em_cascata(): void
    {
        $user = User::factory()->create(); // senha padrão da factory: 'password'
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        $medication->stock()->create(['current_quantity' => 10]);
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => now(),
            'status' => 'taken',
        ]);
        $token = $user->createToken('teste')->plainTextToken;

        $response = $this->actingAs($user)->deleteJson('/api/auth/account', ['password' => 'password']);

        $response->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        // LGPD: "apaga todos os dados", não só a linha do usuário —
        // conferido de verdade via cascade do banco, não suposto.
        $this->assertDatabaseMissing('profiles', ['id' => $profile->id]);
        $this->assertDatabaseMissing('medications', ['id' => $medication->id]);
        $this->assertDatabaseMissing('dose_schedules', ['id' => $schedule->id]);
        $this->assertDatabaseMissing('dose_logs', ['medication_id' => $medication->id]);
        $this->assertDatabaseMissing('stock_items', ['medication_id' => $medication->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_rejeita_exclusao_com_senha_errada_e_nao_apaga_nada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->deleteJson('/api/auth/account', ['password' => 'senha-errada']);

        $response->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
        $this->assertDatabaseHas('profiles', ['id' => $profile->id]);
    }

    public function test_exige_senha_quando_usuario_tem_senha_cadastrada(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->deleteJson('/api/auth/account', []);

        $response->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_exclui_sem_senha_quando_usuario_e_so_oauth(): void
    {
        // Login só por Google/Socialite — sem senha local cadastrada.
        $user = User::factory()->create(['password' => null]);

        $response = $this->actingAs($user)->deleteJson('/api/auth/account', []);

        $response->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }
}
