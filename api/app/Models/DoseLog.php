<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DoseLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'dose_schedule_id',
        'medication_id',
        'profile_id',
        'scheduled_at',
        'taken_at',
        'status',
        'notes',
        'reacted_by_user_id',
        'reacted_at',
    ];

    protected function casts(): array
    {
        return [
            // "scheduled_at"/"taken_at" DE PROPÓSITO não são cast pra
            // 'datetime' (endurecimento 2026-09-09, ver bug de fuso
            // documentado em scheduledAtInTimezone/takenAtInTimezone
            // abaixo). Cast automático rotula o valor cru (hora LOCAL do
            // perfil, sem fuso) com `config('app.timezone')` — sempre
            // errado pra perfil fora de UTC. Ficam como string mesmo,
            // então `$log->scheduled_at` nunca vira um Carbon acidental
            // com fuso mentiroso — quem precisa de instante absoluto usa
            // os métodos explícitos, que pedem o fuso do perfil.
            'reacted_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saved(function (DoseLog $log) {
            $oldStatus = $log->getOriginal('status');
            $newStatus = $log->status;
            $medication = $log->medication;

            if ($medication && $medication->stock) {
                if ($newStatus === 'taken' && $oldStatus !== 'taken') {
                    $medication->stock()->decrement('current_quantity');
                } elseif ($newStatus !== 'taken' && $oldStatus === 'taken') {
                    $medication->stock()->increment('current_quantity');
                }
            }
        });

        static::deleted(function (DoseLog $log) {
            $medication = $log->medication;
            if ($medication && $medication->stock && $log->status === 'taken') {
                $medication->stock()->increment('current_quantity');
            }
        });
    }

    public function doseSchedule(): BelongsTo
    {
        return $this->belongsTo(DoseSchedule::class);
    }

    public function medication(): BelongsTo
    {
        return $this->belongsTo(Medication::class);
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class);
    }

    public function reactedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reacted_by_user_id');
    }

    // Bug real de fuso horário achado 2026-09-09 (levantamento pedido
    // pelo Rilson depois do bug do "sumiu do Hoje"): `scheduled_at` e
    // `taken_at` são gravados no banco como horário LOCAL do perfil, sem
    // informação de fuso (mesmo padrão de GenerateScheduleOccurrences —
    // ver comentário lá). Mas o cast `'datetime'` do Eloquent lê esse
    // valor puro e o rotula com `config('app.timezone')` (UTC) — ERRADO,
    // porque o valor gravado nunca foi UTC de verdade, é hora local do
    // perfil. `$log->scheduled_at->toISOString()` direto (ou qualquer
    // serialização JSON automática do model) sai com "Z" no fim, mas com
    // os MESMOS dígitos gravados — um instante 3h (ou o offset que for)
    // diferente do que a hora local realmente representa. Confirmado por
    // teste (`DoseLogHistoryTest::test_DIAGNOSTICO_...`): `history()`
    // devolvia `scheduled_at` 3h adiantado do que `today()` devolve pra
    // exatamente a mesma dose, com perfil em `America/Recife`.
    //
    // Estes dois métodos são a forma CORRETA de ler os dois campos pra
    // qualquer resposta JSON: leem o valor cru do banco (`getRawOriginal`,
    // sem cast nenhum no meio) e anexam o fuso real do perfil antes de
    // virar instante absoluto. Todo lugar que devolve `scheduled_at`/
    // `taken_at` de um `DoseLog` numa resposta HTTP deve usar isto, nunca
    // o atributo cru do model (ver DoseLogHistoryTest, DoseLogStoreTest,
    // DoseLogTodayTest e DataExportTest — todos com perfil fora de UTC de
    // propósito, pra expor o bug se voltar).
    public function scheduledAtInTimezone(string $timezone): Carbon
    {
        return Carbon::createFromFormat('Y-m-d H:i:s', $this->getRawOriginal('scheduled_at'), $timezone);
    }

    public function takenAtInTimezone(string $timezone): ?Carbon
    {
        $raw = $this->getRawOriginal('taken_at');

        return $raw === null ? null : Carbon::createFromFormat('Y-m-d H:i:s', $raw, $timezone);
    }
}
