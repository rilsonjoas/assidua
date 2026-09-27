<?php

namespace App\Actions;

use App\Models\DoseLog;
use App\Models\Profile;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * P2 / §10.2 — a derivação por ocorrência, isolada num lugar só.
 *
 * Hoje e o Relatório já derivam por ocorrência; o Histórico e o Export
 * não, e consultam `dose_logs` direto. Isso produz **duas verdades**:
 * uma dose prevista e nunca registrada **não aparece no Histórico** (só
 * vira `missed` se o `doses:check-missed` rodar, e ele só roda se o
 * servidor tiver `schedule:run` — ver `bootstrap/app.php:31-33`, onde a
 * própria nota do projeto diz que o schedule "fica só declarado, nunca
 * dispara"). A Home dizia 3 doses, o relatório dizia 2 e o Histórico
 * dizia 1.
 *
 * Esta action é a fonte única. Ela devolve, para cada ocorrência do
 * período, o MESMO estado que o relatório já usa:
 *
 *   recorded      → há `DoseLog` com `taken_at`
 *   skipped       → há log `skipped` (decisão informada, não é falha)
 *   unrecorded    → não há log (a tolerância de 24 h ainda não passou)
 *   marked_missed → há log `missed` (o app marcou depois da tolerância)
 *
 * ⚠️ **Limite de custo, deliberado.** Gerar ocorrência dia a dia em 10
 * anos (`HISTORY_FLOOR_DAYS`) por request não é viável. Por isso o
 * chamador passa uma **janela**, e o que está fora dela é servido a
 * partir dos logs. A janela é explícita e devolvida em
 * `derived_window`, para a tela poder dizer o que está vendo — o mesmo
 * cuidado do `all_taken`/`due === 0` do relatório: nada é afirmado sem
 * que a conta exista.
 */
class DeriveDoseOccurrences
{
    public const STATE_RECORDED = 'recorded';
    public const STATE_SKIPPED = 'skipped';
    public const STATE_UNRECORDED = 'unrecorded';
    public const STATE_MARKED_MISSED = 'marked_missed';

    public const STATE_MISSED = 'missed';

    /**
     * Cache de UM dia de ocorrências, sem os estados (que dependem dos
     * logs e mudam). A forma do cacheado é propositalmente menor que a
     * da resposta: `scheduled_at` vira string, e o resto é reidratado.
     */
    private function cacheKey(Profile $profile, string $date): string
    {
        return "assidua:occurrences:{$profile->id}:{$profile->occurrence_generation}:{$date}";
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function handle(Profile $profile, Carbon $from, Carbon $to, ?int $medicationId = null): array
    {
        $days = $this->daysBetween($from, $to);
        $raw = $this->occurrencesForDays($profile, $days, $medicationId);

        // Os logs do período, carregados UMA vez e indexados por
        // `Y-m-d H:i:s` exato. Carregar por dose seria o N+1 que o §9.1
        // eliminou; indexar por data seria o `orWhereDate` do §9.1 de
        // novo. O estado é aplicado DEPOIS do cache, e é por isso que
        // gravar um log não invalida nada: o cache não guarda estado.
        $logsByOccurrence = $this->indexLogs($profile, $raw, $medicationId);

        $occurrences = [];
        foreach ($raw as $row) {
            $scheduledAt = Carbon::parse($row['scheduled_at']);

            if ($scheduledAt->gt(now())) {
                // Ainda não chegou a hora. Aplicado DEPOIS do cache, de
                // propósito: se o filtro viesse antes, o cache de HOJE
                // ficaria incompleto de manhã e precisaria de TTL curtíssimo
                // para não servir uma lista envelhecida à noite.
                continue;
            }

            $log = $logsByOccurrence[$row['dose_schedule_id']][$scheduledAt->format('Y-m-d H:i:s')] ?? null;

            $occurrences[] = [
                ...$row,
                'log_id' => $log?->id,
                'taken_at' => $log?->takenAtInTimezone($profile->timezone)?->toIso8601String(),
                // `status` mantém o vocabulário do BANCO (`taken` /
                // `skipped` / `missed`) para o filtro de status do app
                // continuar funcionando sem breaking change; `state` é o
                // DERIVADO, o mesmo vocabulário do relatório, que
                // distingue "não registrada" de "marcada como perdida".
                'status' => $log?->status ?? self::STATE_UNRECORDED,
                'state' => $this->stateOf($log),
                'notes' => $log?->notes,
                'reacted_at' => $log?->reacted_at,
                'reacted_by_name' => $log?->reactedBy?->name,
            ];
        }

        usort($occurrences, fn ($a, $b) => strcmp($b['scheduled_at'], $a['scheduled_at']));

        return $occurrences;
    }

    /**
     * @return string[]
     */
    private function daysBetween(Carbon $from, Carbon $to): array
    {
        $days = [];
        $cursor = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();

        while ($cursor->lte($end)) {
            $days[] = $cursor->toDateString();
            $cursor->addDay();
        }

        return $days;
    }

    /**
     * Ocorrências dos dias pedidos, usando o cache.
     *
     * `Cache::many` resolve TODAS as chaves numa ida só ao store — que
     * aqui é o banco (`CACHE_STORE=database`). Consultar dia a dia
     * significaria uma query por dia, e 90 dias de janela virariam 90
     * queries por request.
     *
     * @param  string[]  $days
     * @return array<int, array<string, mixed>>
     */
    private function occurrencesForDays(Profile $profile, array $days, ?int $medicationId): array
    {
        $keys = array_map(fn ($d) => $this->cacheKey($profile, $d), $days);
        $cached = Cache::many($keys);

        // Índice por (schedule, horário): a ocorrência e seu log
        // descrevem a mesma realidade, e uma linha duplicada no Histórico
        // seria o mesmo bug que o `orWhereDate` do §9.1 causava.
        $byOccurrence = [];

        foreach ($days as $i => $day) {
            $rows = $cached[$keys[$i]] ?? null;
            if (! is_array($rows)) {
                continue;
            }
            foreach ($rows as $row) {
                $byOccurrence[$this->occurrenceKey($row)] = $row;
            }
        }

        $missing = [];
        foreach ($days as $i => $day) {
            if (! is_array($cached[$keys[$i]] ?? null)) {
                $missing[] = $day;
            }
        }

        if ($missing === []) {
            return array_values($byOccurrence);
        }

        $fresh = $this->deriveDays($profile, $missing, $medicationId);

        $today = now($profile->timezone)->toDateString();
        $toStore = [];

        foreach ($fresh as $row) {
            $byOccurrence[$this->occurrenceKey($row)] = $row;
            $toStore[Carbon::parse($row['scheduled_at'])->toDateString()][] = $row;
        }

        foreach ($toStore as $date => $rows) {
            Cache::put(
                $this->cacheKey($profile, $date),
                $rows,
                // Dia passado é imutável — já passou a tolerância e já
                // virou `missed`. Hoje ainda pode ganhar horário, então
                //validade curta.
                $date === $today ? now()->addMinutes(10) : now()->addDays(30),
            );
        }

        return array_values($byOccurrence);
    }

    private function occurrenceKey(array $row): string
    {
        return $row['dose_schedule_id'].'|'.$row['scheduled_at'];
    }

    /**
     * Deriva do zero os dias que não estavam em cache.
     *
     * @param  string[]  $days
     * @return array<int, array<string, mixed>>
     */
    private function deriveDays(Profile $profile, array $days, ?int $medicationId): array
    {
        $query = $profile->medications()
            ->with(['schedules' => fn ($q) => $q->where('is_active', true), 'stock'])
            ->where('is_active', true);

        if ($medicationId !== null) {
            $query->where('id', $medicationId);
        }

        $medications = $query->get();
        $rows = [];

        foreach ($days as $date) {
            $cursor = Carbon::parse($date, $profile->timezone);

            foreach ($medications as $medication) {
                foreach ($medication->schedules as $schedule) {
                    foreach ($this->generateOccurrences->handle($schedule, $cursor) as $scheduledAt) {
                        $rows[] = [
                            'dose_schedule_id' => $schedule->id,
                            'medication_id' => $medication->id,
                            'medication_name' => $medication->name,
                            'scheduled_at' => $scheduledAt->copy()
                                ->setTimezone($profile->timezone)
                                ->toIso8601String(),
                            'medication' => $medication->only(['id', 'name', 'dosage', 'unit', 'color', 'days_remaining']),
                            'dose_schedule' => $schedule->only(['id', 'time', 'days_of_week', 'interval_hours']),
                        ];
                    }
                }
            }
        }

        return $rows;
    }

    /**
     * @param  array<int, array<string, mixed>>  $raw
     * @return array<int, array<int, DoseLog>>
     */
    private function indexLogs(Profile $profile, array $raw, ?int $medicationId): array
    {
        $scheduleIds = array_values(array_unique(array_column($raw, 'dose_schedule_id')));

        if ($scheduleIds === []) {
            return [];
        }

        $logs = DoseLog::with('reactedBy:id,name')
            ->whereIn('dose_schedule_id', $scheduleIds)
            ->get()
            ->filter(fn (DoseLog $log) => $log->profile_id === $profile->id
                && ($medicationId === null || $log->medication_id === $medicationId));

        $indexed = [];
        foreach ($logs as $log) {
            $indexed[$log->dose_schedule_id][$log->scheduled_at] = $log;
        }

        return $indexed;
    }

    public function stateOf(?DoseLog $log): string
    {
        if ($log === null) {
            return self::STATE_UNRECORDED;
        }

        return match ($log->status) {
            'taken' => self::STATE_RECORDED,
            'skipped' => self::STATE_SKIPPED,
            'missed' => self::STATE_MARKED_MISSED,
            default => self::STATE_UNRECORDED,
        };
    }

    public function __construct(private GenerateScheduleOccurrences $generateOccurrences) {}
}
