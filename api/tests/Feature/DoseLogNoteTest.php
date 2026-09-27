<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P3 (2026-09-25) — editar a nota da dose.
 *
 * A rota é dedicada, e o teste mais importante deste arquivo é o de
 * **integridade**: ela tem que ser incapaz de mexer em `taken_at` e
 * `status`. A alternativa era reenviar a dose pelo `store` (que é
 * `updateOrCreate`), e aí "editar um campo de texto" reescreveria o
 * registro da dose — e dispararia o marco de streak de novo. O teste
 * existe para travar essa garantia, porque o apertar é o que faria
 * alguém "simplificar" reusando o `store`.
 */
class DoseLogNoteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-07-15 12:00:00', 'UTC'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function logDoDono(array $overrides = []): array
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create(array_merge([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 08:05:00',
            'status' => 'taken',
        ], $overrides));

        return [$user, $profile, $medication, $schedule, $log];
    }

    public function test_dono_edita_a_nota(): void
    {
        [$user, , , , $log] = $this->logDoDono();

        $response = $this->actingAs($user)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => 'Tomei depois do almoço.']);

        $response->assertOk();
        $this->assertSame('Tomei depois do almoço.', $log->fresh()->notes);
    }

    // ── a garantia de integridade ────────────────────────────────────

    public function test_editar_a_nota_nao_toca_taken_at_nem_status(): void
    {
        [$user, , , , $log] = $this->logDoDono();
        $antesTaken = $log->taken_at;
        $antesStatus = $log->status;

        $this->actingAs($user)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => 'qualquer coisa'])
            ->assertOk();

        $log->refresh();
        $this->assertSame($antesTaken, $log->taken_at, 'A nota não pode reescrever o horário real.');
        $this->assertSame($antesStatus, $log->status, 'A nota não pode reescrever o status.');
    }

    public function test_apagar_a_nota_e_legitimo(): void
    {
        [$user, , , , $log] = $this->logDoDono(['notes' => 'texto antigo']);

        $this->actingAs($user)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => null])
            ->assertOk();

        $this->assertNull($log->fresh()->notes);
    }

    public function test_nota_respeita_o_mesmo_teto_de_500_caracteres(): void
    {
        [$user, , , , $log] = $this->logDoDono();

        $this->actingAs($user)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => str_repeat('a', 501)])
            ->assertStatus(422);

        // E o `store` tem o mesmo teto: um registro não pode ter um
        // limite e o outro não.
        $this->actingAs($user)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => str_repeat('a', 500)])
            ->assertOk();
    }

    public function test_cuidador_aceito_tem_o_mesmo_poder_sobre_a_nota(): void
    {
        // Mesma regra que `delete`: quem pode desfazer o registro pode
        // corrigi-lo. E o cuidador é quem mais tarde escreve ali.
        [$dono, $profile, $medication, $schedule, $log] = $this->logDoDono();
        $cuidador = User::factory()->create();
        ProfileCollaborator::factory()->accepted()->create([
            'profile_id' => $profile->id,
            'invited_by_user_id' => $dono->id,
            'user_id' => $cuidador->id,
        ]);

        $this->actingAs($cuidador)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => 'A mãe passou mal depois do almoço.'])
            ->assertOk();

        $this->assertSame('A mãe passou mal depois do almoço.', $log->fresh()->notes);
    }

    public function test_terceiro_nao_edita_a_nota_de_perfil_alheio(): void
    {
        [, , , , $log] = $this->logDoDono();
        $intruso = User::factory()->create();

        $this->actingAs($intruso)
            ->patchJson("/api/dose-logs/{$log->id}/note", ['notes' => 'invadido'])
            ->assertForbidden();

        $this->assertNull($log->fresh()->notes);
    }
}
