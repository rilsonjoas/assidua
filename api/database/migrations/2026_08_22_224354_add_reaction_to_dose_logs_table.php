<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Reação do cuidador" (2026-08-22) — ideia de produto: cuidador
     * remoto só ouvia do app quando algo dava errado (alerta de dose
     * perdida). Isto dá um jeito de 1 toque de reagir quando a dose foi
     * tomada — vira sinal de presença, não só de vigilância. Um
     * reator por dose (não é feed de reações), suficiente pro v1.
     */
    public function up(): void
    {
        Schema::table('dose_logs', function (Blueprint $table) {
            $table->foreignId('reacted_by_user_id')->nullable()->after('notes')->constrained('users')->nullOnDelete();
            $table->timestamp('reacted_at')->nullable()->after('reacted_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('dose_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reacted_by_user_id');
            $table->dropColumn('reacted_at');
        });
    }
};
