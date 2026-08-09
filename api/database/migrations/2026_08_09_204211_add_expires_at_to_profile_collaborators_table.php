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
        // Código de convite é essencialmente um bearer token — quem tem
        // o código entra, sem expiração ele fica válido pra sempre se
        // vazar (print de tela, link encaminhado sem querer). Dado de
        // saúde não deveria ter esse risco em aberto indefinidamente.
        Schema::table('profile_collaborators', function (Blueprint $table) {
            $table->timestamp('expires_at')->nullable()->after('invite_code');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('profile_collaborators', function (Blueprint $table) {
            $table->dropColumn('expires_at');
        });
    }
};
