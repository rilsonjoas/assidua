<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Deliberadamente separado de `is_active` (2026-08-12): is_active
        // já tem semântica de "apagado/oculto" travada por teste
        // (MedicationTest::test_index_lista_apenas_medicamentos_ativos) —
        // reaproveitar pra "pausado" faria o medicamento sumir da lista
        // de Remédios, sem jeito de reativar pela UI. `is_paused` é
        // visível na lista (com selo), só não gera dose/notificação
        // enquanto estiver true.
        Schema::table('medications', function (Blueprint $table) {
            $table->boolean('is_paused')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->dropColumn('is_paused');
        });
    }
};
