<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DoseSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'medication_id',
        'time',
        'days_of_week',
        'interval_hours',
        'is_active',
        // "Dose fora do horário" (item 8, 2026-09-08) — override de
        // âncora só pro dia salvo em `today_override_date`; ver
        // GenerateScheduleOccurrences e RecalculateTodayOccurrences.
        'today_override_date',
        'today_override_time',
    ];

    protected function casts(): array
    {
        return [
            'days_of_week' => 'array',
            'is_active' => 'boolean',
            'today_override_date' => 'date',
        ];
    }

    public function medication(): BelongsTo
    {
        return $this->belongsTo(Medication::class);
    }

    public function doseLogs(): HasMany
    {
        return $this->hasMany(DoseLog::class);
    }
}
