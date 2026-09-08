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
        // "Dose fora do horário + recálculo" (item 8, 2026-09-08) —
        // achado real do Rilson: tomar um remédio de intervalo (ex.: de 8
        // em 8h) num horário bem diferente do previsto deveria poder
        // deslocar as próximas doses DAQUELE DIA, sem virar o novo
        // horário permanente (isso já existe em `time`/editar horário).
        //
        // Guardado como um par (data, hora) em vez de só "hora": um
        // override sem data expiraria sozinho errado (valeria pra
        // sempre, todo dia, sem querer). Comparando a data salva com
        // "hoje" (fuso do perfil) em GenerateScheduleOccurrences, o
        // override se autoexpira sozinho à meia-noite — não precisa de
        // job de limpeza nem de apagar o valor de volta depois de usar.
        Schema::table('dose_schedules', function (Blueprint $table) {
            $table->date('today_override_date')->nullable();
            $table->time('today_override_time')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dose_schedules', function (Blueprint $table) {
            $table->dropColumn(['today_override_date', 'today_override_time']);
        });
    }
};
