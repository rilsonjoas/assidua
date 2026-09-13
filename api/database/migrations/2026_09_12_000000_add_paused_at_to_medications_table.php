<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// "Pausar não deveria esconder o que já aconteceu" (entrevista de
// horário, 2026-09-12) — achado real do Rilson: pausar um remédio hoje
// escondia a dose já tomada hoje da tela Hoje, e zerava sua contribuição
// pra streak/adesão do dia. `is_paused` sozinho (um booleano) não dá pra
// saber SE HOJE, especificamente, a dose já tinha sido resolvida antes
// do momento da pausa — precisa do INSTANTE exato da pausa pra separar
// "doses de hoje já resolvidas antes de pausar" (contam) de "doses de
// hoje que ainda dependiam do remédio continuar ativo" (não deviam
// nunca ter sido geradas, já que foram pausadas antes de vencer).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->timestamp('paused_at')->nullable()->after('is_paused');
        });
    }

    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->dropColumn('paused_at');
        });
    }
};
