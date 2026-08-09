<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

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
    ];

    // Sempre presente no JSON — a tela Hoje e a tela Estoque precisam de
    // days_remaining sem ter que calcular de novo no frontend (mesma
    // conta em dois lugares divergiria com o tempo).
    protected $appends = ['days_remaining'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
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
