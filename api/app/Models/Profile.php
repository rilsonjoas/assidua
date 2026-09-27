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
        'timezone',
        'last_weekly_summary_sent_at',
        'occurrence_generation',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'last_weekly_summary_sent_at' => 'datetime',
            // P2/§10.2 — entra na chave do cache de ocorrências. Precisa
            // ser int, senão "1" e 1 geram chaves diferentes.
            'occurrence_generation' => 'integer',
        ];
    }

    /**
     * Invalida o cache de ocorrências deste perfil (P2/§10.2).
     *
     * Sobe o contador em vez de apagar chaves: as chaves antigas ficam
     * órfãs e expiram sozinhas. Invalidar um perfil inteiro é O(1),
     * enquanto apagar dia a dia seria O(dias).
     *
     * Chamar em: criação/edição/desativação de medication, e
     * criação/edição/desativação/pausa de dose_schedule.
     */
    public function bumpOccurrenceGeneration(): void
    {
        $this->increment('occurrence_generation');
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

    public function timezoneChanges(): HasMany
    {
        return $this->hasMany(ProfileTimezoneChange::class);
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
