<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Convite + colaboração de cuidador num perfil (Fase 1.5, Etapa 1).
// Uma linha cobre os dois estados: pendente (user_id nulo, invite_code
// preenchido) e aceito (user_id preenchido, invite_code nulo,
// accepted_at preenchido). Ver Etapa 2 pro fluxo de convite/resgate.
class ProfileCollaborator extends Model
{
    use HasFactory;

    protected $fillable = [
        'profile_id',
        'invited_by_user_id',
        'user_id',
        'role',
        'invite_code',
        'accepted_at',
    ];

    protected function casts(): array
    {
        return [
            'accepted_at' => 'datetime',
        ];
    }

    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    public function scopeAccepted(Builder $query): Builder
    {
        return $query->whereNotNull('accepted_at');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('accepted_at');
    }
}
