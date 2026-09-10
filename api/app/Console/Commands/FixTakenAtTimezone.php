<?php

namespace App\Console\Commands;

use App\Models\DoseLog;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Backfill one-time do bug de fuso horário achado 2026-09-09 (ver
 * DoseLogController::store, comentário no commit): antes da correção,
 * `taken_at` era gravado com a LEITURA EM UTC do instante enviado pelo
 * app, tratada como se já fosse hora local do perfil — nunca convertida,
 * diferente de `scheduled_at` (que já convertia desde 2026-09-08). Pra
 * qualquer perfil fora de UTC, todo `taken_at` já gravado está deslocado
 * pelo offset do perfil.
 *
 * Este comando reinterpreta cada `taken_at` existente como a leitura em
 * UTC que ele sempre foi de verdade, e regrava na convenção certa (hora
 * local do perfil, sem fuso) — a mesma que `scheduled_at` já usa.
 *
 * SEM --execute roda em modo DRY-RUN: mostra o plano, não escreve nada.
 * Rodar com backup do banco feito ANTES (P6) — é escrita direta,
 * irreversível sem esse backup.
 */
class FixTakenAtTimezone extends Command
{
    protected $signature = 'assidua:fix-taken-at-timezone
        {--execute : Aplica a correção de verdade (padrão: dry-run)}';

    protected $description = 'Corrige taken_at gravado com o fuso errado antes da correção de 2026-09-09 (perfis fora de UTC)';

    public function handle(): int
    {
        $execute = (bool) $this->option('execute');

        if (! $execute) {
            $this->warn('DRY-RUN — nada será escrito. Use --execute para aplicar.');
        }

        $logs = DoseLog::whereNotNull('taken_at')
            ->with('profile:id,timezone')
            ->get(['id', 'profile_id', 'taken_at']);

        $fixed = 0;
        $skippedNoProfile = 0;

        foreach ($logs as $log) {
            $profile = $log->profile;
            if (! $profile) {
                $skippedNoProfile++;

                continue;
            }

            // Perfil em UTC nunca teve o bug — a "leitura em UTC" e a
            // "hora local do perfil" são a mesma coisa, offset zero.
            if ($profile->timezone === 'UTC' || $profile->timezone === null) {
                continue;
            }

            $rawTakenAt = $log->getRawOriginal('taken_at');
            if ($rawTakenAt === null) {
                continue;
            }

            // O valor gravado sempre foi, na prática, a leitura em UTC do
            // instante — reinterpreta como tal e converte pro fuso real
            // do perfil, chegando na hora local que a pessoa realmente
            // digitou/tocou.
            $corrected = Carbon::createFromFormat('Y-m-d H:i:s', $rawTakenAt, 'UTC')
                ->setTimezone($profile->timezone)
                ->format('Y-m-d H:i:s');

            if ($corrected === $rawTakenAt) {
                continue; // offset efetivo zero nesse instante (não deveria acontecer fora de UTC, mas não custa checar)
            }

            $this->line("DoseLog #{$log->id} (perfil #{$profile->id}, {$profile->timezone}): {$rawTakenAt} -> {$corrected}");

            if ($execute) {
                DB::table('dose_logs')->where('id', $log->id)->update(['taken_at' => $corrected]);
            }

            $fixed++;
        }

        if ($skippedNoProfile > 0) {
            $this->warn("{$skippedNoProfile} log(s) sem perfil associado, ignorados.");
        }

        $this->info(($execute ? '' : '[dry-run] ') . "{$fixed} registro(s) de taken_at corrigido(s).");

        return self::SUCCESS;
    }
}
