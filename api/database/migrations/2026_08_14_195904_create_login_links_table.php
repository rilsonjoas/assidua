<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Login sem senha (2026-08-14) — decisão do Rilson: manter conta local
// (junto com Google, nunca só um — ver README) significava manter
// "esqueci a senha" como obrigatório. Em vez de reset de senha
// tradicional, o login local vira passwordless: um link de acesso de
// uso único por e-mail, mais simples pro público-alvo (nada pra
// lembrar/errar) e sem senha pra vazar/reutilizar.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('login_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Hash, não o token em si — igual ao padrão do próprio
            // Laravel pra password_reset_tokens; um vazamento do banco
            // não dá acesso de graça.
            $table->string('token_hash')->unique();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_links');
    }
};
