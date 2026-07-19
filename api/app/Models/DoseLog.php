<?php

namespace App\Models;

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
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'taken_at' => 'datetime',
        ];
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
}
