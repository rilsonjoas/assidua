<?php

namespace App\Actions;

use App\Models\DoseSchedule;
use App\Models\Profile;
use Carbon\Carbon;

// Fase 2 (2026-08-11) — "Streak de adesão": dias consecutivos com 100%
// das doses tomadas.
//
// Decisões de escopo, documentadas porque não são óbvias:
// - Dia sem nenhum horário programado pra aquele dia da semana (schedule
//   pausado/removido, ou simplesmente não há dose prevista) é NEUTRO —
//   não quebra nem conta a sequência, só é pulado. Sem isso, alguém que
//   toma um remédio só às segundas veria a sequência "quebrar" toda
//   terça-feira, o que não faz sentido nenhum.
// - "Hoje" nunca quebra a sequência sozinho enquanto ainda houver dose
//   pendente (sem log e o horário ainda não passou) — só conta quando
//   100% completo, e só quebra se já tiver dose perdida/pulada
//   registrada hoje. Dias passados sem log nenhum (schedule que existia
//   mas nunca foi marcado, de antes do CheckMissedDoses existir, por
//   exemplo) contam como quebra — escolha conservadora, evita inflar a
//   sequência por buraco de dado.
// - Usa os schedules ATIVOS de agora, projetados pra trás. Não existe
//   histórico de "schedule existia em tal data" — é uma aproximação
//   aceitável pro MVP, documentada aqui pra não ser esquecida.
class CalculateAdherenceStreak
{
    private const MAX_LOOKBACK_DAYS = 730;

    public function __construct(private GenerateScheduleOccurrences $generateOccurrences) {}

    public function handle(Profile $profile): array
    {
        $today = Carbon::today($profile->timezone);

        // Achado real do Rilson (2026-09-12): "pausado" não filtra mais
        // aqui — um dia em que a dose já tinha sido tomada ANTES de
        // pausar não pode deixar de contar pra sequência só porque o
        // remédio está pausado hoje. GenerateScheduleOccurrences decide
        // isso caso a caso (pelo instante de `paused_at`), não esta
        // query. `medication_id` no select + `with('medication')`: a
        // Action acima precisa da relação carregada pra checar a pausa.
        $schedules = DoseSchedule::where('is_active', true)
            ->whereHas('medication', fn ($q) => $q->where('profile_id', $profile->id)->where('is_active', true))
            ->with('medication:id,is_paused,paused_at')
            ->get(['id', 'medication_id', 'time', 'days_of_week', 'interval_hours']);

        if ($schedules->isEmpty()) {
            return ['current_streak' => 0, 'best_streak' => 0];
        }

        $earliestDate = $today->copy()->subDays(self::MAX_LOOKBACK_DAYS);

        $logsByDate = $profile->doseLogs()
            ->whereIn('dose_schedule_id', $schedules->pluck('id'))
            ->where('scheduled_at', '>=', $earliestDate)
            ->get(['dose_schedule_id', 'status', 'scheduled_at'])
            // `scheduled_at` não é mais cast pra Carbon (2026-09-09, ver
            // DoseLog::scheduledAtInTimezone) — é string "Y-m-d H:i:s" já
            // em hora local do perfil; os primeiros 10 caracteres são a
            // data, sem precisar de nenhum Carbon nem fuso aqui.
            ->groupBy(fn ($log) => substr($log->scheduled_at, 0, 10));

        $current = 0;
        $best = 0;
        $running = 0;
        $counting = true; // vira false na primeira quebra encontrada (a partir de hoje)

        for ($date = $today->copy(); $date->gte($earliestDate); $date->subDay()) {
            // "Frequência de horário" (2026-08-14): "devido hoje" agora
            // conta ocorrências, não schedules — um remédio de intervalo
            // conta várias doses no mesmo dia, não uma só.
            $dueScheduleIds = [];
            $dueCount = 0;
            foreach ($schedules as $schedule) {
                $occurrenceCount = count($this->generateOccurrences->handle($schedule, $date));
                if ($occurrenceCount > 0) {
                    $dueScheduleIds[] = $schedule->id;
                    $dueCount += $occurrenceCount;
                }
            }

            if ($dueCount === 0) {
                continue; // dia neutro — nada previsto
            }

            $dayLogs = $logsByDate->get($date->format('Y-m-d'), collect())
                ->filter(fn ($log) => in_array($log->dose_schedule_id, $dueScheduleIds));

            $takenCount = $dayLogs->where('status', 'taken')->count();
            $hasFailure = $dayLogs->whereIn('status', ['missed', 'skipped'])->isNotEmpty();
            $isToday = $date->isSameDay($today);

            if ($takenCount >= $dueCount) {
                $running++;
                $best = max($best, $running);
                if ($counting) {
                    $current = $running;
                }
                continue;
            }

            if ($isToday && ! $hasFailure) {
                continue; // hoje ainda em andamento — não conta, não quebra
            }

            $running = 0;
            $counting = false;
        }

        return ['current_streak' => $current, 'best_streak' => $best];
    }
}
