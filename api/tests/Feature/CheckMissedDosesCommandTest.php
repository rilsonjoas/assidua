<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// Fase 1.5, Etapa 4 — o comando é o que garante o alerta mesmo sem
// ninguém abrir o app (diferente de today(), que só roda sob demanda).
//
// Tolerância de 24h (2026-09-11, entrevista de decisões de horário —
// ver ROADMAP.md) — antes disto o comando marcava "Perdido" na hora
// (isPast() cru). Abaixo de 24h, o app mostra "Atrasado" sozinho, sem
// nenhum envolvimento deste comando (é 100% calculado no cliente); só
// depois de 24h de atraso é que vira "Perdido" de verdade no banco.
//
// Perfis aqui são criados com timezone 'UTC' (2026-08-10): esta suíte
// testa a lógica do comando (marca/não marca, não duplica), não fuso
// horário — isso tem teste dedicado em ProfileTimezoneTest. Trava em UTC
// pra "hora congelada" == "hora local", como o resto do arquivo assume.
class CheckMissedDosesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_marca_como_perdida_dose_com_mais_de_24h_de_atraso(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-16 08:01:00')); // 24h01min depois de 07-15 08:00

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'status' => 'missed',
        ]);
    }

    // Achado real do Rilson (2026-09-11): sem tolerância nenhuma, 2h de
    // atraso já virava "Perdido" — a pessoa não tinha nenhuma margem
    // real pra corrigir/registrar antes de a dose já contar como
    // perdida. Dentro das 24h, o app mostra "Atrasado" sozinho (não
    // depende deste comando); este comando não deve marcar nada ainda.
    public function test_nao_marca_dose_atrasada_dentro_da_tolerancia_de_24h(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-15 10:00:00')); // só 2h de atraso

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        // days_of_week só na quarta (15/07 é quarta, dayOfWeek=3) — sem
        // isso o schedule também gera a ocorrência de ONTEM (14/07 08h),
        // que a esta altura JÁ passou de 24h de atraso de verdade
        // (24h+2h) e seria corretamente marcada — mascarando o que este
        // teste quer provar (a ocorrência de HOJE, só 2h atrasada,
        // continua intocada).
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => [3]]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(0, DoseLog::count());
    }

    public function test_nao_mexe_em_dose_de_horario_futuro(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-15 06:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $medication->schedules()->create(['time' => '20:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(0, DoseLog::count());
    }

    public function test_nao_duplica_log_ja_existente(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-16 08:01:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => Carbon::parse('2026-07-15 08:00:00'),
            'taken_at' => now(),
            'status' => 'taken',
        ]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(1, DoseLog::where('dose_schedule_id', $schedule->id)->count());
        $this->assertDatabaseHas('dose_logs', ['dose_schedule_id' => $schedule->id, 'status' => 'taken']);
    }

    public function test_ignora_medicamento_inativo(): void
    {
        Http::fake();
        Carbon::setTestNow(Carbon::parse('2026-07-16 08:01:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id, 'is_active' => false]);
        $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(0, DoseLog::count());
    }

    // "Frequência de horário" (2026-08-14) — um schedule de intervalo
    // pode ter várias ocorrências perdidas no mesmo dia, cada uma precisa
    // virar um log `missed` separado, não só um por schedule.
    public function test_marca_cada_ocorrencia_passada_de_schedule_de_intervalo_como_perdida(): void
    {
        Http::fake();
        // 24h+ depois das ocorrências de 07-15 (07h/15h/23h) — 07h e 15h
        // já completaram 24h de atraso às 16h do dia 16; 23h só completa
        // às 23h do dia 16, ainda não chegou.
        Carbon::setTestNow(Carbon::parse('2026-07-16 16:00:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create([
            'time' => '07:00:00',
            'days_of_week' => null,
            'interval_hours' => 8,
        ]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertSame(2, DoseLog::where('dose_schedule_id', $schedule->id)->where('status', 'missed')->count());
    }

    // Achado real (2026-09-11, junto da tolerância de 24h): o comando
    // calcula "hoje" fresco a cada execução e só olhava as ocorrências
    // desse dia — uma ocorrência tarde da noite só completa 24h de
    // atraso já no dia SEGUINTE, quando "hoje" pro comando já virou
    // outro dia e essa ocorrência nunca mais aparecia em nenhuma
    // execução futura. Ficava perdida (sem NUNCA marcar "Perdido") pra
    // sempre. Prova que olhar "ontem" também (além de "hoje") resolve.
    public function test_ocorrencia_tarde_da_noite_ainda_e_marcada_perdida_no_dia_seguinte(): void
    {
        Http::fake();
        // Dose das 23:50 de 07-15 só completa 24h de atraso às 23:50 do
        // dia 16 — comando roda de novo (de 15 em 15min) já em 07-16,
        // "hoje" pro comando é 07-16, a ocorrência é de 07-15 ("ontem").
        Carbon::setTestNow(Carbon::parse('2026-07-16 23:51:00'));

        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '23:50:00', 'days_of_week' => null]);

        $this->artisan('doses:check-missed')->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', [
            'dose_schedule_id' => $schedule->id,
            'scheduled_at' => '2026-07-15 23:50:00',
            'status' => 'missed',
        ]);
    }
}
