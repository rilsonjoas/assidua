<?php

namespace Tests\Feature;

use App\Models\DoseLog;
use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FixTakenAtTimezoneTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Isola o marcador de "já rodou" do disco real — sem isso, rodar
        // a suíte localmente depois de já ter executado o comando de
        // verdade em algum outro contexto vazaria estado entre testes.
        Storage::fake('local');
    }

    public function test_dry_run_nao_escreve_nada(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        // Simula um taken_at gravado pelo bug antigo: "10:00" é a leitura
        // em UTC de quando a pessoa tocou "Tomei" às 07:00 em Recife
        // (10:00 UTC - 3h), mas foi gravado cru, sem converter.
        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 10:00:00',
            'status' => 'taken',
        ]);

        $this->artisan('assidua:fix-taken-at-timezone')
            ->expectsOutputToContain('DRY-RUN')
            ->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', ['taken_at' => '2026-07-15 10:00:00']);
    }

    public function test_execute_corrige_taken_at_de_perfil_fora_de_utc(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 10:00:00', // leitura em UTC do instante real (07:00 Recife)
            'status' => 'taken',
        ]);

        $this->artisan('assidua:fix-taken-at-timezone', ['--execute' => true])
            ->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', [
            'id' => $log->id,
            'taken_at' => '2026-07-15 07:00:00',
        ]);
    }

    public function test_nao_mexe_em_perfil_ja_em_utc(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'UTC']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 08:05:00',
            'status' => 'taken',
        ]);

        $this->artisan('assidua:fix-taken-at-timezone', ['--execute' => true])
            ->assertSuccessful();

        $this->assertDatabaseHas('dose_logs', ['taken_at' => '2026-07-15 08:05:00']);
    }

    public function test_nao_mexe_em_log_sem_taken_at(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'status' => 'skipped',
        ]);

        $this->artisan('assidua:fix-taken-at-timezone', ['--execute' => true])
            ->assertSuccessful();

        $this->assertSame(0, DB::table('dose_logs')->whereNotNull('taken_at')->count());
    }

    // Achado real ao verificar em produção (2026-09-09): rodar --execute
    // duas vezes desloca o mesmo taken_at DUAS vezes, porque o comando
    // não tem como distinguir "já corrigido" de "nunca teve o bug" só
    // olhando o dado. Marcador em disco bloqueia a segunda execução.
    public function test_bloqueia_segundo_execute_sem_force(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id, 'timezone' => 'America/Recife']);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $schedule = $medication->schedules()->create(['time' => '08:00:00', 'days_of_week' => null]);

        $log = DoseLog::create([
            'dose_schedule_id' => $schedule->id,
            'medication_id' => $medication->id,
            'profile_id' => $profile->id,
            'scheduled_at' => '2026-07-15 08:00:00',
            'taken_at' => '2026-07-15 10:00:00',
            'status' => 'taken',
        ]);

        $this->artisan('assidua:fix-taken-at-timezone', ['--execute' => true])->assertSuccessful();
        $this->assertDatabaseHas('dose_logs', ['id' => $log->id, 'taken_at' => '2026-07-15 07:00:00']);

        // Segunda tentativa sem --force: falha, NÃO desloca de novo.
        $this->artisan('assidua:fix-taken-at-timezone', ['--execute' => true])->assertFailed();
        $this->assertDatabaseHas('dose_logs', ['id' => $log->id, 'taken_at' => '2026-07-15 07:00:00']);

        // Dry-run continua permitido mesmo com o marcador presente (só
        // lê, não escreve).
        $this->artisan('assidua:fix-taken-at-timezone')->assertSuccessful();
        $this->assertDatabaseHas('dose_logs', ['id' => $log->id, 'taken_at' => '2026-07-15 07:00:00']);
    }
}
