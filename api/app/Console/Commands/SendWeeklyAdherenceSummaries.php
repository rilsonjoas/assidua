<?php

namespace App\Console\Commands;

use App\Actions\SendWeeklyAdherenceSummary;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

// "Resumo semanal" (Fase 2, 2026-08-13) — roda de hora em hora
// (agendado em bootstrap/app.php) e, pra cada perfil, checa se agora é
// domingo às 20h **no fuso daquele perfil** — não no fuso do servidor.
// Mesmo raciocínio do CheckMissedDoses: "agora" precisa ser calculado
// por perfil, não uma vez só pra todos (Brasil sozinho já tem 4 fusos).
//
// `last_weekly_summary_sent_at` evita mandar o mesmo resumo de novo a
// cada execução dentro da janela de 1h (das 20:00 às 20:59).
#[Signature('adherence:send-weekly-summary')]
#[Description('Manda notificação de resumo semanal de adesão pros perfis cujo domingo às 20h (no próprio fuso) é agora')]
class SendWeeklyAdherenceSummaries extends Command
{
    public function handle(SendWeeklyAdherenceSummary $sendSummary): int
    {
        $checked = 0;
        $sent = 0;

        Profile::with('user.pushTokens')->chunkById(100, function ($profiles) use ($sendSummary, &$checked, &$sent) {
            foreach ($profiles as $profile) {
                $checked++;

                $now = Carbon::now($profile->timezone);
                if ($now->dayOfWeek !== Carbon::SUNDAY || $now->hour !== 20) {
                    continue;
                }

                $weekStart = $now->copy()->startOfDay()->subDays(6);
                if ($profile->last_weekly_summary_sent_at?->gte($weekStart)) {
                    continue; // já mandou o resumo dessa semana
                }

                if ($sendSummary->handle($profile)) {
                    $sent++;
                }

                // Marca mesmo quando handle() retorna false (nada previsto
                // essa semana) — sem isso, um perfil sem schedule ficaria
                // sendo recalculado toda hora dentro da janela à toa.
                $profile->update(['last_weekly_summary_sent_at' => $now]);
            }
        });

        $this->info("Perfis checados: {$checked}. Resumos enviados: {$sent}.");

        return self::SUCCESS;
    }
}
