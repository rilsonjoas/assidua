<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Forma" do remédio e "conteúdo da embalagem" (2026-11-13, achado do
 * Rilson com o Vick Vaporub: "12 g" estava no campo de dosagem, e o
 * estoque dizia "1 comprimidos").
 *
 * As duas colunas são NULLABLE de propósito: remédio já cadastrado fica
 * sem forma, e o app continua tratando-o exatamente como antes. Nenhuma
 * linha existente é reescrita — inferir a forma de "mg" ou do nome
 * seria inventar dado.
 *
 * - `form`: comprimido, capsula, liquido, gotas, topico, spray,
 *   injetavel, adesivo, outro. Decide as unidades oferecidas, o tipo de
 *   alerta de estoque e o texto da dose.
 * - `package_content`: texto livre do que vem na embalagem ("12 g",
 *   "120 mL"). É informação, não dose: nunca entra em conta.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->string('form', 20)->nullable()->after('unit');
            $table->string('package_content', 50)->nullable()->after('form');
        });
    }

    public function down(): void
    {
        Schema::table('medications', function (Blueprint $table) {
            $table->dropColumn(['form', 'package_content']);
        });
    }
};
