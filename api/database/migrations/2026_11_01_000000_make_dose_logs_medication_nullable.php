<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Integridade de histórico de saúde: excluir um medicamento não pode
 * apagar o histórico de doses que o paciente tomou.
 *
 * Mesma abordagem adotada em 2026_09_25_200000 para `dose_schedule_id`:
 * substitui cascadeOnDelete() por nullOnDelete().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dose_logs', function (Blueprint $table) {
            $table->dropForeign(['medication_id']);
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('medication_id')->nullable()->change();
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->foreign('medication_id')
                ->references('id')->on('medications')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('dose_logs', function (Blueprint $table) {
            $table->dropForeign(['medication_id']);
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('medication_id')->nullable(false)->change();
        });

        Schema::table('dose_logs', function (Blueprint $table) {
            $table->foreign('medication_id')
                ->references('id')->on('medications')
                ->cascadeOnDelete();
        });
    }
};
