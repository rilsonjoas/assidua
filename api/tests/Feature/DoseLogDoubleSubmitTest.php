<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\DoseSchedule;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Duplo toque em "Tomei" (2026-09-28).
 *
 *  * proteção existe no app. Este arquivo cobre o **backend**, porque é lá
 * que a garantia final tem que estar: o botão desabilitado é
 * conveniência de UI, não invariante de dado. E o alvo do app é justamente
 * gente com tremor e baixa destreza motora, que toca duas vezes sem querer
 * sem querer esperar.
 *
 * As DUAS idempotências existem, e por caminhos diferentes: a dose agendada
 * por `updateOrCreate` em `dose_schedule_id`, a dose de resgate por
 * `client_key`. Este arquivo trava as duas, porque a garantia final tem
 * que estar no servidor: `disabled={markDose.isPending}` no botão é
 * conveniência de UI, e um toque duplo com atraso de rede, um retry do
 * react-query ou um aparelho lento não passam pelo botão.
 *
 * Este teste NÃO afirma que a duplicata acontece — afirma o que o dado
 * garante hoje, para que a decisão (idempotência na dose agendada ou não)
 * seja consciente e não acidental.
 */
class DoseLogDoubleSubmitTest extends TestCase
{
    use RefreshDatabase;

    private function agendada(): array
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = DoseSchedule::factory()->create([
            'medication_id' => $medication->id,
            'time' => '08:00',
            'days_of_week' => null,
            'is_active' => true,
        ]);
        return [$user, $profile, $medication, $schedule];
    }

    private function registrar(array $dados): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($dados[0])->postJson('/api/dose-logs', [
            'dose_schedule_id' => $dados[3]->id,
            'medication_id' => $dados[2]->id,
            'profile_id' => $dados[1]->id,
            'scheduled_at' => '2026-09-28 08:00:00',
            'status' => 'taken',
        ]);
    }

    public function test_dose_agendada_registrada_uma_vez(): void
    {
        $d = $this->agendada();
        $this->registrar($d)->assertCreated();

        $this->assertSame(1, DoseLog::where('dose_schedule_id', $d[3]->id)->count());
    }

    public function test_reenvio_da_mesma_dose_agendada_nao_duplica(): void
    {
        // A garantia está no BACKEND, em `updateOrCreate` por
        // `dose_schedule_id` (DoseLogController, chave do upsert). Escrevi
        // este teste ACHANDO que faltava idempotência aqui e que dois POST
        // criariam dois registros — o teste falhou dizendo que havia 1, e
        // a verdade é que já havia proteção.
        //
        // Isso importa porque o botão desabilitado no app
        // (`disabled={markDose.isPending}`) vira conveniência, não
        // garantia: um toque duplo com atraso de rede, um retry do
        // react-query, ou um aparelho lento não passam pelo botão.
        $d = $this->agendada();
        $this->registrar($d)->assertCreated();
        $this->registrar($d)->assertCreated();

        $this->assertSame(1, DoseLog::where('dose_schedule_id', $d[3]->id)->count());
    }

    public function test_reenvio_atualiza_o_registro_em_vez_de_acrescentar(): void
    {
        // O outro lado da mesma garantia: não duplicar E não ficar com
        // dado velho. O reenvio precisa ter algo DIFERENTE para provar que
        // substituiu — por isso a nota muda.
        $d = $this->agendada();
        $this->registrar($d)->assertCreated();
        DoseLog::where('dose_schedule_id', $d[3]->id)->update(['notes' => 'primeira']);

        $this->actingAs($d[0])->postJson('/api/dose-logs', [
            'dose_schedule_id' => $d[3]->id,
            'medication_id' => $d[2]->id,
            'profile_id' => $d[1]->id,
            'scheduled_at' => '2026-09-28 08:00:00',
            'status' => 'taken',
            'notes' => 'segunda',
        ])->assertCreated();

        $logs = DoseLog::where('dose_schedule_id', $d[3]->id)->get();
        $this->assertCount(1, $logs);
        $this->assertSame('segunda', $logs[0]->notes);
    }

    public function test_prn_e_idempotente_por_client_key(): void
    {
        // O contraponto: a dose avulsa NÃO duplica, porque o `client_key`
        // é a identidade. Este é o comportamento que a dose agendada
        // deveria ter — está aqui para os dois casos ficarem lado a lado
        // e a diferença ficar visível.
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_prn' => true]);
        $key = '33333333-3333-4333-8333-333333333333';

        $payload = [
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'status' => 'taken',
            'taken_at' => '2026-09-28 14:00:00',
            'client_key' => $key,
        ];

        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();
        $this->actingAs($user)->postJson('/api/dose-logs', $payload)->assertCreated();

        $this->assertSame(1, DoseLog::where('client_key', $key)->count());
    }

    public function test_hibrido_dose_agendada_com_client_key_e_rejeitado(): void
    {
        // O guarda é um XOR explícito: agendada não leva `client_key`, e
        // avulsa não leva `dose_schedule_id`/`scheduled_at`. O híbrido
        // era o que permitia duplicata (ver o comentário do controller),
        // então travar aqui é o que sustenta a idempotência da PRN.
        [$user, $profile, $medication, $schedule] = $this->agendada();

        $this->actingAs($user)->postJson('/api/dose-logs', [
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-09-28 08:00:00',
            'status' => 'taken',
            'client_key' => '44444444-4444-4444-8444-444444444444',
        ])->assertUnprocessable();

        $this->assertSame(0, DoseLog::count());
    }
}
