<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P2 / §10.2 — contador de geração do perfil, para o cache da derivação
 * por ocorrência.
 *
 * **Por que uma coluna e não `profiles.updated_at`:** o cache da derivação
 * guarda as ocorrências por dia, com a chave
 * `occurrences:{perfil}:{geração}:{data}`. Quando um **horário** muda, as
 * ocorrências de vários dias mudam junto — e `updated_at` do *perfil* não
 * se move, porque a edição acontece em `dose_schedules`. Sem isto, o cache
 * serviria ocorrências velhas depois de mudar o horário, que é pior do que
 * não cachear.
 *
 * **Como se invalida:** sobe-se este inteiro. As chaves antigas ficam
 * órfãs e expiram sozinhas — invalidação O(1), sem varrer dias. Só
 * precisa ser incremented em duas situações:
 *
 *   1. criação/edição/desativação de `medications`
 *   2. criação/edição/desativação/pausa de `dose_schedules`
 *
 * Gravação de `DoseLog` **não** toca aqui: ela invalida só o dia
 * afetado, via `Cache::forget`, que é barato e cirúrgico.
 *
 * O default 1 (e não 0) é para nunca haver perfil com geração 0 — o 0
 * fica reservado como "não inicializado" caso algum código legado leia.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->unsignedInteger('occurrence_generation')->default(1);
        });
    }

    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn('occurrence_generation');
        });
    }
};
