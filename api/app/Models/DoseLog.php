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
        'reacted_by_user_id',
        'reacted_at',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'taken_at' => 'datetime',
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
}
