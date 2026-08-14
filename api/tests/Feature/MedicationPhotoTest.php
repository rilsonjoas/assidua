<?php

namespace Tests\Feature;

use App\Models\Medication;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// "Foto do medicamento" (2026-08-13).
class MedicationPhotoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    public function test_envia_foto_e_ela_aparece_como_photo_url(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);
        $photo = UploadedFile::fake()->image('remedio.jpg');

        $response = $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => $photo],
        );

        $response->assertOk();
        $this->assertNotNull($response->json('photo_url'));
        $this->assertArrayNotHasKey('photo_path', $response->json()); // detalhe interno, não deve vazar

        Storage::disk('public')->assertExists("medication-photos/{$profile->id}/" . $photo->hashName());
    }

    public function test_enviar_foto_nova_apaga_a_antiga_do_disco(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->image('primeira.jpg')],
        );
        // photo_path é $hidden no model — busca direto do banco pra
        // conferir o arquivo real no disco, não o que a API expõe.
        $firstPath = \DB::table('medications')->where('id', $medication->id)->value('photo_path');

        $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->image('segunda.jpg')],
        );

        Storage::disk('public')->assertMissing($firstPath);
    }

    public function test_rejeita_arquivo_que_nao_e_imagem(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->create('bula.pdf', 100, 'application/pdf')],
        );

        $response->assertUnprocessable()->assertJsonValidationErrors('photo');
    }

    public function test_rejeita_imagem_maior_que_5mb(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->image('grande.jpg')->size(6000)],
        );

        $response->assertUnprocessable()->assertJsonValidationErrors('photo');
    }

    public function test_remove_foto(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->image('remedio.jpg')],
        );
        $path = \DB::table('medications')->where('id', $medication->id)->value('photo_path');

        $response = $this->actingAs($user)->deleteJson("/api/medications/{$medication->id}/photo");

        $response->assertOk();
        $this->assertNull($response->json('photo_url'));
        Storage::disk('public')->assertMissing($path);
    }

    public function test_apagar_medicamento_remove_a_foto_do_disco_tambem(): void
    {
        $user = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $user->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $this->actingAs($user)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->image('remedio.jpg')],
        );
        $path = \DB::table('medications')->where('id', $medication->id)->value('photo_path');

        $this->actingAs($user)->deleteJson("/api/medications/{$medication->id}")->assertNoContent();

        Storage::disk('public')->assertMissing($path);
    }

    public function test_nao_permite_upload_de_medicamento_de_outro_usuario(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $profile = Profile::factory()->create(['user_id' => $owner->id]);
        $medication = Medication::factory()->create(['profile_id' => $profile->id]);

        $response = $this->actingAs($intruder)->postJson(
            "/api/medications/{$medication->id}/photo",
            ['photo' => UploadedFile::fake()->image('remedio.jpg')],
        );

        $response->assertForbidden();
    }
}
