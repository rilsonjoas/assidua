<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Profile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'color',
        'avatar_emoji',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function medications(): HasMany
    {
        return $this->hasMany(Medication::class);
    }

    public function doseLogs(): HasMany
    {
        return $this->hasMany(DoseLog::class);
    }

    public function collaborators(): HasMany
    {
        return $this->hasMany(ProfileCollaborator::class);
    }

    // Fase 1.5, Etapa 3 — usado pelas Policies pra decidir quem pode ver/
    // agir num perfil sem ser o dono. Cuidador aceito pode ver e agir
    // sobre doses/estoque; gerenciar o perfil em si (renomear, apagar,
    // convidar outro cuidador) continua exclusivo do dono.
    public function isCollaborator(User $user): bool
    {
        return $this->collaborators()->accepted()->where('user_id', $user->id)->exists();
    }

    public function isAccessibleBy(User $user): bool
    {
        return $this->user_id === $user->id || $this->isCollaborator($user);
    }
}
