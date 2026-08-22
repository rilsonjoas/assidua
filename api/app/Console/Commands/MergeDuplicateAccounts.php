<?php

namespace App\Console\Commands;

use App\Models\Profile;
use App\Models\ProfileCollaborator;
use App\Models\PushToken;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Merge one-time de contas duplicadas (mesmo e-mail, portas de entrada
 * diferentes). Achado real em produção (2026-08-22): login Google de
 * e-mail já cadastrado via magic link criava segunda conta — dados da
 * mesma pessoa divididos. O código agora vincula na hora; este comando
 * conserta as duplicatas que JÁ existiam.
 *
 * Regras do merge:
 *  - Agrupa por e-mail com COUNT(*) > 1.
 *  - Keeper = conta com MAIS perfis (empate: menor id) — é a que tem os
 *    dados reais.
 *  - De cada conta removida: google_id vai pro keeper (se keeper não
 *    tiver); profiles/push_tokens migram; tokens Sanctum morrem (sessões
 *    da conta removida); colaborações apontam pro keeper.
 *  - SEM --execute roda em modo DRY-RUN: mostra o plano, não escreve
 *    nada. Rodar com backup do banco feito ANTES (P6).
 */
class MergeDuplicateAccounts extends Command
{
    protected $signature = 'assidua:merge-duplicate-accounts
        {--execute : Aplica o merge de verdade (padrão: dry-run)}';

    protected $description = 'Funde contas duplicadas do mesmo e-mail (Google × magic link), mantendo a conta com mais dados';

    public function handle(): int
    {
        $execute = (bool) $this->option('execute');

        if (! $execute) {
            $this->warn('🔍 DRY-RUN — nada será escrito. Use --execute para aplicar.');
        }

        $emails = User::selectRaw('email, COUNT(*) as total')
            ->groupBy('email')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('email');

        if ($emails->isEmpty()) {
            $this->info('Nenhuma duplicata encontrada. Nada a fazer. ✅');

            return self::SUCCESS;
        }

        foreach ($emails as $email) {
            $users = User::withCount('profiles')
                ->where('email', $email)
                ->orderBy('id')
                ->get();

            $keeper = $users->sortByDesc('profiles_count')->first();
            $movers = $users->reject(fn (User $u) => $u->id === $keeper->id);

            $this->line("── {$email}");
            $this->line("   MANTER  #{$keeper->id} ({$keeper->profiles_count} perfis, google_id=".
                ($keeper->google_id ? 'sim' : 'não').')');

            foreach ($movers as $mover) {
                $this->line("   REMOVER #{$mover->id} ({$mover->profiles_count} perfis, google_id=".
                    ($mover->google_id ? 'sim' : 'não').')');
                $this->line("     → migrar perfis/push_tokens p/ #{$keeper->id}; sessões da removida morrem");

                if (! $execute) {
                    continue;
                }

                if (! $keeper->google_id && $mover->google_id) {
                    $keeper->forceFill(['google_id' => $mover->google_id])->save();
                }

                Profile::where('user_id', $mover->id)->update(['user_id' => $keeper->id]);
                PushToken::where('user_id', $mover->id)->update(['user_id' => $keeper->id]);
                ProfileCollaborator::where('user_id', $mover->id)->update(['user_id' => $keeper->id]);
                ProfileCollaborator::where('invited_by_user_id', $mover->id)
                    ->update(['invited_by_user_id' => $keeper->id]);

                // Sessões/tokens da conta removida: morte limpa
                $mover->tokens()->delete();

                $mover->delete(); // cascades cuidam do resto (login_links etc.)
            }
        }

        if (! $execute) {
            $this->newLine();
            $this->warn('Dry-run concluído. Conferiu o plano? Backup feito? Então: --execute');
        } else {
            $this->newLine();
            $this->info('Merge aplicado. ✅');
        }

        return self::SUCCESS;
    }
}
