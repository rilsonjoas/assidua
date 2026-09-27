<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * P4 / §10.4 — **segunda metade**: `dose_schedule_id` e `scheduled_at`
 * ficam anuláveis.
 *
 * Só é seguro **depois** de `client_key` existir (migration anterior,
 * `2026_09_25_100000`). Com os dois nulos, o `updateOrCreate` do
 * `DoseLogController::store` indexaria toda dose avulsa pela chave
 * `(NULL, NULL)` — uma linha só para todas, e a segunda sobrescreveria a
 * primeira sem erro. A ordem entre as duas migrations é o que segura
 * isso, e por isso ambas estão na mesma data com prefixos
 * `100000` e `200000`.
 *
 * A FOREIGN KEY também precisa cair: em SQLite, `foreignId()->constrained()`
 * gera uma restrição que `->nullable()` sozinho não resolve — é preciso
 * recriar a tabela. Por isso o caminho é o mesmo do Laravel para
 * SQLite: tabela nova, cópia, troca. Em MySQL (produção) seria só
 * `->nullable()->change()`, mas o caminho por recriação funciona nos dois
 * e é o que a documentação do framework recomenda para migração de coluna
 * com restrição.
 *
 * ⚠️ O comentário original dizia que o caminho seria "recriar a tabela"
 * (o truque do SQLite antigo). Não é mais necessário: o Laravel 11+
 * faz `change()` direto, e o `dropForeign` + `change()` + `foreign()`
 * abaixo é o caminho suportado nos dois bancos. `taken_at` fica
 * intacta — não muda nada nela.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dose_logs', function (Blueprint $table) {
            // A restriction precisa sair ANTES de a coluna aceitar nulo.
            $table->dropForeign(['dose_schedule_id']);
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('dose_schedule_id')->nullable()->change();
            $table->timestamp('scheduled_at')->nullable()->change();
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            // Recriada como nullable, e `nullOnDelete` em vez de cascade:
            // apagar um horário não pode apagar o registro da dose. A
            // dose continua existindo — vira uma dose avulsa, que é a
            // semântica correta: ela existiu, took-se, e o horário que a
            // previa deixou de existir. `cascadeOnDelete` sumiria com o
            // histórico do paciente, que é dado de saúde.
            $table->foreign('dose_schedule_id')
                ->references('id')->on('dose_schedules')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        // O `down` só é possível enquanto não existir dose avulsa: sem
        // `dose_schedule_id` não dá para reconstruir a chave obrigatória.
        $avulsas = DB::table('dose_logs')->whereNull('dose_schedule_id')->count();

        if ($avulsas > 0) {
            throw new RuntimeException(
                "Não dá para reverter: existem {$avulsas} doses avulsas sem dose_schedule_id. "
                .'A reversão apagaria o histórico delas. Crie a migration manualmente se precisar.'
            );
        }

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->dropForeign(['dose_schedule_id']);
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('dose_schedule_id')->nullable(false)->change();
            $table->timestamp('scheduled_at')->nullable(false)->change();
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->foreign('dose_schedule_id')
                ->references('id')->on('dose_schedules')
                ->cascadeOnDelete();
        });
    }
};
