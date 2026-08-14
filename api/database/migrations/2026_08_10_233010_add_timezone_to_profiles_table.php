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
        // Achado real (2026-08-10): backend inteiro calculava "hoje"
        // (tela Hoje, detecção de dose perdida) com Carbon::today()/now()
        // sem timezone — resolvia sempre em UTC (config('app.timezone')),
        // não no fuso de quem usa o app. Pra alguém em Brasília (UTC-3),
        // a virada de dia no backend acontecia às 21h local, 3h
        // adiantada; em Manaus/Acre (UTC-4/-5), 4-5h. Default aqui é o
        // fuso mais comum entre os usuários atuais — quem estiver em
        // outro se autocorrige no próximo login (ver sync no app).
        Schema::table('profiles', function (Blueprint $table) {
            $table->string('timezone')->default('America/Sao_Paulo');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });
    }
};
