<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    // "Duração do tratamento" (2026-08-14) — achado real de uso, anotado
    // no Obsidian: muitos remédios têm limite de dias pra tomar
    // (antibiótico é o exemplo clássico), e o app não registrava isso.
    // Decisão de produto confirmada com o Rilson: quando acabar, só
    // avisar — nunca pausar sozinho (reaproveitar `is_paused` pra isso
    // seria uma ação automática sobre o tratamento da pessoa; um aviso é
    // reversível e sem surpresa, pausar de verdade continua sendo
    // escolha manual).
    //
    // `treatment_duration_days` opcional (a maioria dos remédios é uso
    // contínuo, sem fim previsto) — quando setado, o fim é calculado a
    // partir de `created_at` (data do cadastro), sem precisar de um
    // campo "data de início" separado; é a aproximação mais simples que
    // ainda resolve o problema real. `treatment_end_notified_at` é o
    // dedupe (mesmo padrão de `last_weekly_summary_sent_at` em
    // profiles) — evita mandar o aviso de novo toda vez que o comando
    // agendado rodar.
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->unsignedSmallInteger('treatment_duration_days')->nullable();
            $table->timestamp('treatment_end_notified_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->dropColumn(['treatment_duration_days', 'treatment_end_notified_at']);
        });
    }
};
