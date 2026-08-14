<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    // Achado real de uso (2026-08-14, anotado no Obsidian enquanto o
    // Rilson usava o app): nem todo remédio tem uma dosagem numérica
    // que faça sentido cadastrar (ex.: "conforme orientação médica",
    // pomada, colírio). Obrigar sempre foi fricção sem ganho.
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->string('dosage')->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->string('dosage')->nullable(false)->change();
        });
    }
};
