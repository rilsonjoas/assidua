<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Marcador de troca de fuso (2026-09-11) — ver migration
// create_profile_timezone_changes_table pro raciocínio completo.
class ProfileTimezoneChange extends Model
{
    protected $fillable = [
        'profile_id',
        'old_timezone',
        'new_timezone',
        'changed_at',
    ];

    protected function casts(): array
    {
        return [
            'changed_at' => 'datetime',
        ];
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class);
    }
}
