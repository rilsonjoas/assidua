<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'google_id',
        'avatar_url',
        'subscription_tier',
        'subscription_expires_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $appends = [
        'has_password',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'subscription_expires_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function getHasPasswordAttribute(): bool
    {
        return $this->password !== null;
    }

    public function profiles(): HasMany
    {
        return $this->hasMany(Profile::class);
    }

    // Perfis de OUTRAS contas em que este usuário é cuidador aceito
    // (Fase 1.5, Etapa 1) — não inclui os perfis próprios, que já vêm
    // de profiles() acima.
    public function sharedProfiles(): BelongsToMany
    {
        return $this->belongsToMany(Profile::class, 'profile_collaborators')
            ->wherePivot('accepted_at', '!=', null)
            ->withPivot('role', 'accepted_at');
    }

    public function isPro(): bool
    {
        return $this->subscription_tier === 'pro'
            && ($this->subscription_expires_at === null || $this->subscription_expires_at->isFuture());
    }
}
