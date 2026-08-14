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
        // "Foto do medicamento" (2026-08-13) — valor real pro público
        // idoso/cuidador: reconhecer visualmente costuma valer mais que
        // ler o nome. Guarda só o caminho relativo (disco `public`,
        // storage:link) — a URL completa é montada no accessor
        // `photo_url` do model, igual o padrão já usado em
        // `days_remaining`.
        Schema::table('medications', function (Blueprint $table) {
            $table->string('photo_path')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->dropColumn('photo_path');
        });
    }
};
