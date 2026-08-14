<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Storage;

class Medication extends Model
{
    use HasFactory;

    protected $fillable = [
        'profile_id',
        'name',
        'dosage',
        'unit',
        'color',
        'instructions',
        'notes',
        'is_active',
        'is_paused',
        'photo_path',
        'treatment_duration_days',
        // Achado real (2026-08-14): faltou aqui na primeira versão —
        // `NotifyTreatmentEndingCommand` chama `$medication->update([
        // 'treatment_end_notified_at' => now()])`, e sem estar em
        // `$fillable` isso é silenciosamente ignorado (mass assignment
        // guard), o dedupe nunca persistia de verdade. `$hidden`
        // (não aparecer no JSON) e `$fillable` (poder ser atualizado em
        // massa) são coisas diferentes — mesmo padrão de
        // `last_weekly_summary_sent_at` em Profile.
        'treatment_end_notified_at',
    ];

    // Sempre presente no JSON — a tela Hoje e a tela Estoque precisam de
    // days_remaining sem ter que calcular de novo no frontend (mesma
    // conta em dois lugares divergiria com o tempo). photo_url junto
    // pelo mesmo motivo — o app nunca precisa saber o path interno,
    // só a URL pronta pra usar. treatment_ends_at (2026-08-14) segue o
    // mesmo raciocínio — calculado uma vez aqui, não recalculado no
    // frontend.
    protected $appends = ['days_remaining', 'photo_url', 'treatment_ends_at'];

    // Path é detalhe interno de armazenamento — o app só recebe photo_url
    // (accessor abaixo), nunca o caminho relativo no disco do servidor.
    // treatment_end_notified_at também é detalhe interno (controla o
    // dedupe do aviso agendado) — o app não precisa saber disso, só do
    // treatment_ends_at calculado.
    protected $hidden = ['photo_path', 'treatment_end_notified_at'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_paused' => 'boolean',
            'treatment_end_notified_at' => 'datetime',
        ];
    }

    // Refill alert inteligente (Fase 1) — média de doses/dia considerando
    // schedules restritos a dias específicos da semana (ex: só seg/qua/sex
    // conta 3/7, não 1/dia).
    public function dosesPerDay(): float
    {
        $schedules = $this->relationLoaded('schedules')
            ? $this->schedules->where('is_active', true)
            : $this->schedules()->where('is_active', true)->get();

        $perWeek = $schedules->sum(
            fn ($schedule) => $schedule->days_of_week === null ? 7 : count($schedule->days_of_week)
        );

        return $perWeek / 7;
    }

    protected function daysRemaining(): Attribute
    {
        return Attribute::make(get: function () {
            if (! $this->relationLoaded('stock') || ! $this->stock) {
                return null;
            }

            $dosesPerDay = $this->dosesPerDay();
            if ($dosesPerDay <= 0) {
                return null;
            }

            return (int) floor($this->stock->current_quantity / $dosesPerDay);
        });
    }

    protected function photoUrl(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->photo_path ? Storage::disk('public')->url($this->photo_path) : null,
        );
    }

    // "Duração do tratamento" (2026-08-14) — sem campo de "data de
    // início" separado, de propósito: usa `created_at` (quando o
    // remédio foi cadastrado) como o começo do tratamento. Aproximação
    // simples que resolve o problema real sem inflar o formulário.
    protected function treatmentEndsAt(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->treatment_duration_days
                ? $this->created_at->copy()->addDays($this->treatment_duration_days)->toDateString()
                : null,
        );
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(DoseSchedule::class);
    }

    public function doseLogs(): HasMany
    {
        return $this->hasMany(DoseLog::class);
    }

    public function stock(): HasOne
    {
        return $this->hasOne(StockItem::class);
    }
}
