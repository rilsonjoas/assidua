<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * P4 / §10.4 — **primeira metade**: a chave de idempotência da dose
 * avulsa, ANTES de `dose_schedule_id` ficar anulável.
 *
 * A ordem importa, e invertê-la quebra a dose avulsa em silêncio.
 *
 * O `DoseLogController::store` faz `updateOrCreate` pela chave
 * `(dose_schedule_id, scheduled_at)`. Com os dois nulos — que é
 * exatamente o caso da dose avulsa — **todas** as doses avulsas caem na
 * mesma chave `(NULL, NULL)`: uma linha só para todas. A segunda dose
 * de resgate sobrescreveria a primeira, e o paciente perderia o registro
 * sem nenhum erro aparecer.
 *
 * Por isso a chave nova entra **antes**, e o `store` passa a indexar
 * por ela. Numa migration futura (`make_dose_logs_schedule_nullable`),
 * a coluna só pode ficar anulável depois que isto estiver em uso.
 *
 * Sobre `client_key` ser uma string e não um id: ela é gerada no
 * **aparelho** (UUID), porque a dose avulsa é criada offline — às vezes
 * sem rede nenhuma, e o `id` autoincremental só existe depois de
 * sincronizar. A fila offline precisa de uma identidade *antes* do
 * servidor, que é exatamente o que a migration do §10.4 exige.
 *
 * `is_prn` fica em `medications`, e não em `dose_logs`: é uma
 * **propriedade do remédio** ("este é de resgate"), não do registro. Uma
 * dose avulsa é consequência de o remédio ser PRN — mas nem toda dose
 * de um remédio PRN é avulsa (quem tem horário fixo registra nele).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            // "PRN" = *pro re nata*, "conforme necessário", "se precisar".
            // O nome do app é "resgate"; no banco fica o termo clínico,
            // porque é o que quem lê o código entende sem tradução.
            $table->boolean('is_prn')->default(false)->after('is_paused');
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            // Chave de idempotência da dose avulsa. Nula para dose
            // agendada, que continua se identificando por
            // `(dose_schedule_id, scheduled_at)`.
            $table->uuid('client_key')->nullable()->after('id');

            // Índice simples, **não** único de propósito. A unicidade é
            // garantida na aplicação (ver `DoseLogController::store`),
            // porque MySQL e SQLite tratam `NULL` de jeitos diferentes
            // em índice único: no MySQL vários `NULL` convivem, e um
            // índice único lá não protegeria nada. Aqui o índice serve
            // só para a busca no `updateOrCreate` ser indexada.
            $table->index('client_key');
        });
    }

    public function down(): void
    {
        Schema::table('dose_logs', function (Blueprint $table) {
            $table->dropIndex(['client_key']);
            $table->dropColumn('client_key');
        });

        Schema::table('medications', function (Blueprint $table) {
            $table->dropColumn('is_prn');
        });
    }
};
