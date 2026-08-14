<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    // Achado real (2026-08-14): a coluna nunca guardou emoji de verdade
    // apesar do nome — guarda o nome do ícone do MaterialCommunityIcons
    // usado no mobile (ex.: `baby-face-outline`, 17 caracteres). O limite
    // de 10 (herdado de quando o campo seria emoji literal) rejeitava
    // 7 dos 12 ícones da lista de seleção — a maioria, não um caso raro.
    // 40 dá margem confortável pra qualquer nome de ícone da lib.
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->string('avatar_emoji', 40)->default('account')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->string('avatar_emoji', 10)->default('👤')->change();
        });
    }
};
