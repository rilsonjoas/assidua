<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// "Marcador permanente de troca de fuso" (2026-09-11, entrevista de
// decisões de horário — ver ROADMAP.md, item 6/20). `syncOwnedProfileTimezones`
// (app) já troca o fuso do perfil silenciosamente ao abrir "Hoje";
// princípio do Rilson ("transparência total, agência total") pede que
// isso fique visível de verdade, não só um toast que passa e some —
// este registro entra no feed do Histórico, persistido no backend
// (sobrevive troca de aparelho/reinstall, mesma fonte de verdade que o
// resto do Histórico já usa).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profile_timezone_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('profile_id')->constrained()->cascadeOnDelete();
            $table->string('old_timezone');
            $table->string('new_timezone');
            // Instante absoluto (não hora local sem fuso) — ao contrário
            // de DoseLog::scheduled_at/taken_at, aqui não existe
            // ambiguidade de "hora local de qual fuso" (é literalmente o
            // evento de troca), então cast 'datetime' normal serve bem.
            $table->timestamp('changed_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('profile_timezone_changes');
    }
};
