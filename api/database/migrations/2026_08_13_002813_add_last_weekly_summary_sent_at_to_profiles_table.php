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
        // "Resumo semanal" (Fase 2, 2026-08-13) — dedupe do envio. O
        // comando roda de hora em hora e checa "é domingo às 20h no fuso
        // deste perfil?" — sem isso, ele mandaria o mesmo resumo de novo
        // a cada execução dentro da janela de 1h.
        Schema::table('profiles', function (Blueprint $table) {
            $table->timestamp('last_weekly_summary_sent_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn('last_weekly_summary_sent_at');
        });
    }
};
