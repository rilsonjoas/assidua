<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\PushToken;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// "Duração do tratamento" (2026-08-14) — comando agendado, mesmo padrão
// de CheckMissedDoses/SendWeeklyAdherenceSummaries.
//
// Achado real ao escrever este teste: `created_at` não está em
// `$fillable` do Medication (nem devia estar) — passar
// `Medication::factory()->create(['created_at' => ...])` é
// silenciosamente ignorado pelo mass assignment guard, `created_at`
// real vira o `Carbon::setTestNow()` do momento do `create()`, não o
// valor pretendido. Fix: define o "agora" ANTES de criar (então
// created_at nasce certo pelo timestamp automático do Eloquent) e só
// depois avança o relógio pra data de checagem.
class NotifyTreatmentEndingCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_avisa_quando_o_tratamento_termina_hoje(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-10 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        PushToken::factory()->create(['user_id' => $user->id]);
        // Cadastrado agora (10/08), tratamento de 10 dias -> termina 20/08.
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'treatment_duration_days' => 10,
        ]);

        Carbon::setTestNow(Carbon::parse('2026-08-20 10:00:00', 'UTC'));
        $this->artisan('medications:notify-treatment-ending')->assertSuccessful();

        $medication->refresh();
        $this->assertNotNull($medication->treatment_end_notified_at);
        Http::assertSent(fn ($request) => $request->url() === 'https://exp.host/--/api/v2/push/send');
    }

    public function test_nao_avisa_antes_do_fim_do_tratamento(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-10 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        PushToken::factory()->create(['user_id' => $user->id]);
        // Tratamento de 10 dias, mas só passaram 5.
        $medication = Medication::factory()->create([
            'profile_id' => $profile->id,
            'treatment_duration_days' => 10,
        ]);

        Carbon::setTestNow(Carbon::parse('2026-08-15 10:00:00', 'UTC'));
        $this->artisan('medications:notify-treatment-ending')->assertSuccessful();

        $medication->refresh();
        $this->assertNull($medication->treatment_end_notified_at);
        Http::assertNothingSent();
    }

    public function test_nao_avisa_de_novo_quando_ja_avisado(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-10 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        PushToken::factory()->create(['user_id' => $user->id]);
        Medication::factory()->create([
            'profile_id' => $profile->id,
            'treatment_duration_days' => 10,
        ]);

        Carbon::setTestNow(Carbon::parse('2026-08-20 10:00:00', 'UTC'));
        // Primeira execução: avisa de verdade (fluxo real da própria app,
        // não um forceFill artificial).
        $this->artisan('medications:notify-treatment-ending')->assertSuccessful();
        Http::assertSentCount(1);

        // Segunda execução, mesmo dia: não deve mandar de novo.
        $this->artisan('medications:notify-treatment-ending')->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_medicamento_sem_duracao_definida_nunca_e_checado(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-20 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        PushToken::factory()->create(['user_id' => $user->id]);
        Medication::factory()->create([
            'profile_id' => $profile->id,
            'treatment_duration_days' => null,
        ]);

        $this->artisan('medications:notify-treatment-ending')->assertSuccessful();

        Http::assertNothingSent();
    }

    public function test_medicamento_inativo_nao_e_avisado(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-08-10 10:00:00', 'UTC'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        PushToken::factory()->create(['user_id' => $user->id]);
        Medication::factory()->create([
            'profile_id' => $profile->id,
            'is_active' => false,
            'treatment_duration_days' => 10,
        ]);

        Carbon::setTestNow(Carbon::parse('2026-08-20 10:00:00', 'UTC'));
        $this->artisan('medications:notify-treatment-ending')->assertSuccessful();

        Http::assertNothingSent();
    }
}
