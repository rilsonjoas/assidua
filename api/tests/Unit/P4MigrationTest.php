<?php

namespace Tests\Unit;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * P4 (§10.4) — a chave de idempotência precisa existir e estar no lugar
 * **antes** de `dose_schedule_id` ficar anulável.
 *
 * Sem ela, todas as doses avulsas caem na mesma chave `(NULL, NULL)` do
 * `updateOrCreate` — uma linha só para todas, e a segunda sobrescreve a
 * primeira sem erro nenhum.
 */
class P4MigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_medications_tem_flag_de_prn(): void
    {
        $this->assertTrue(Schema::hasColumn('medications', 'is_prn'));
    }

    public function test_dose_logs_tem_client_key(): void
    {
        $this->assertTrue(Schema::hasColumn('dose_logs', 'client_key'));
    }

    public function test_doses_avulsas_nao_precisam_de_dose_schedule_e_aceitam_uuid(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $med = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);

        foreach ([1, 2, 3] as $_) {
            DoseLog::create([
                'client_key' => (string) Str::uuid(),
                'dose_schedule_id' => null,
                'medication_id' => $med->id,
                'profile_id' => $profile->id,
                'scheduled_at' => null,
                'taken_at' => now(),
                'status' => 'taken',
            ]);
        }

        $this->assertSame(3, DoseLog::whereNull('dose_schedule_id')->count());
    }
}
