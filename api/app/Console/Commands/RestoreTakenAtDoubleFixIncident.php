<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Restauração cirúrgica de um incidente específico (2026-09-09):
 * `assidua:fix-taken-at-timezone --execute` rodou DUAS vezes em produção
 * porque a trava de "já rodou" checava `storage/app/` enquanto o disco
 * `local` do Laravel 13 aponta pra `storage/app/private/` — o marcador
 * escrito manualmente no caminho errado nunca foi visto pela trava.
 * Resultado: os mesmos 18 registros foram deslocados -3h DUAS vezes
 * (deveriam ter sido deslocados só uma).
 *
 * Este comando não reinterpreta nada — só restaura cada `taken_at`
 * afetado pro valor exato que já era o correto depois da PRIMEIRA
 * execução (capturado do próprio log de saída dela). Isto é
 * deliberadamente um comando de uso único, específico deste incidente —
 * não um utilitário genérico. Mantido no repositório como registro,
 * igual aos outros comandos de correção pontual do projeto.
 */
class RestoreTakenAtDoubleFixIncident extends Command
{
    protected $signature = 'assidua:restore-taken-at-double-fix-incident {--execute}';

    protected $description = 'Restaura os 18 dose_logs deslocados 2x pelo incidente de 2026-09-09 (ver docblock)';

    /** @var array<int, string> */
    private const CORRECT_VALUES = [
        34 => '2026-09-08 14:45:54',
        35 => '2026-09-08 20:28:49',
        36 => '2026-09-09 11:48:41',
        37 => '2026-09-09 11:48:58',
        38 => '2026-09-09 14:31:27',
        41 => '2026-09-09 21:44:16',
        40 => '2026-09-09 21:44:00',
        3 => '2026-08-22 20:18:07',
        4 => '2026-08-22 20:18:08',
        6 => '2026-08-23 20:26:38',
        7 => '2026-08-23 20:36:57',
        15 => '2026-09-07 21:20:35',
        16 => '2026-09-07 21:20:40',
        17 => '2026-09-07 21:34:20',
        20 => '2026-09-07 21:53:22',
        31 => '2026-09-08 09:24:22',
        32 => '2026-09-08 09:24:29',
        33 => '2026-09-08 09:24:40',
    ];

    public function handle(): int
    {
        $execute = (bool) $this->option('execute');

        foreach (self::CORRECT_VALUES as $id => $correctValue) {
            $current = DB::table('dose_logs')->where('id', $id)->value('taken_at');
            $this->line("DoseLog #{$id}: atual={$current} -> restaurar={$correctValue}");

            if ($execute) {
                DB::table('dose_logs')->where('id', $id)->update(['taken_at' => $correctValue]);
            }
        }

        $this->info(($execute ? '' : '[dry-run] ') . count(self::CORRECT_VALUES) . ' registro(s) restaurado(s).');

        return self::SUCCESS;
    }
}
