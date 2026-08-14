<?php

namespace App\Console\Commands;

use App\Actions\NotifyTreatmentEnding;
use App\Models\Medication;
use Carbon\Carbon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

// "Duração do tratamento" (2026-08-14, agendado em bootstrap/app.php) —
// decisão de produto confirmada com o Rilson: quando os dias acabarem,
// só avisar, nunca pausar sozinho. `treatment_end_notified_at` nulo é o
// próprio filtro de "ainda não avisei" — evento acontece uma vez só na
// vida do medicamento, diferente do resumo semanal (que se repete toda
// semana e por isso precisa comparar contra a janela atual, não só
// checar null).
//
// "Hoje" é calculado por perfil (mesmo raciocínio de CheckMissedDoses/
// SendWeeklyAdherenceSummaries) — cada perfil pode estar em fuso
// diferente.
#[Signature('medications:notify-treatment-ending')]
#[Description('Avisa quando a duração do tratamento de um remédio termina — nunca pausa sozinho, só notifica (Fase 2)')]
class NotifyTreatmentEndingCommand extends Command
{
    public function handle(NotifyTreatmentEnding $notify): int
    {
        $checked = 0;
        $notified = 0;

        Medication::whereNotNull('treatment_duration_days')
            ->whereNull('treatment_end_notified_at')
            ->where('is_active', true)
            ->with('profile.user.pushTokens')
            ->chunkById(100, function ($medications) use ($notify, &$checked, &$notified) {
                foreach ($medications as $medication) {
                    $checked++;

                    $profile = $medication->profile;
                    $today = Carbon::today($profile->timezone);
                    $endsAt = Carbon::parse($medication->treatment_ends_at);

                    if ($endsAt->gt($today)) {
                        continue; // ainda não chegou o fim do tratamento
                    }

                    $notify->handle($medication);
                    $medication->update(['treatment_end_notified_at' => now()]);
                    $notified++;
                }
            });

        $this->info("Medicamentos checados: {$checked}. Avisos enviados: {$notified}.");

        return self::SUCCESS;
    }
}
