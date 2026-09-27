<?php

namespace App\Http\Controllers;

use App\Models\Medication;
use App\Models\Profile;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

class MedicationController extends Controller
{
    public function index(Request $request, Profile $profile): JsonResponse
    {
        Gate::authorize('view', $profile);

        $medications = $profile->medications()
            ->with(['schedules', 'stock'])
            ->where('is_active', true)
            ->get();

        return response()->json($medications);
    }

    public function store(Request $request, Profile $profile): JsonResponse
    {
        // Mesmo achado do DoseScheduleController::store() — 'view', não
        // 'update'. Cadastrar medicamento novo continua só do dono.
        Gate::authorize('update', $profile);

        $user = $request->user();

        if (! $user->isPro() && $profile->medications()->where('is_active', true)->count() >= 15) {
            return response()->json([
                'message' => 'Limite de 15 medicamentos por perfil no plano gratuito. Faça upgrade para o Pro.',
            ], 403);
        }

        $data = $request->validate([
            'name' => 'required|string|max:150',
            // Achado real de uso (2026-08-14): nem todo remédio tem
            // dosagem numérica relevante — nunca devia ser obrigatório.
            'dosage' => 'nullable|string|max:50',
            'unit' => 'sometimes|string|max:30',
            'color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'instructions' => 'nullable|string',
            'notes' => 'nullable|string',
            // "Duração do tratamento" (2026-08-14) — opcional, a maioria
            // dos remédios é uso contínuo. Max 3650 (10 anos) é só um
            // teto generoso, não um limite real esperado.
            'treatment_duration_days' => 'nullable|integer|min:1|max:3650',
            // P4 (§10.4) — "remédio de resgate". Sem esta linha o
            // recurso era INALCANÇÁVEL: a coluna existia, a migration
            // existia, a dose de resgate tinha todo o resto do caminho
            // pronto — e nenhuma tela ou cliente conseguia marcar um
            // remédio como PRN, porque o campo era recusado na
            // validação. Default false mantém inalterado todo cadastro
            // existente.
            'is_prn' => 'sometimes|boolean',
        ]);

        $medication = $profile->medications()->create($data);

        $medication->stock()->create([
            'unit' => $data['unit'] ?? 'comprimidos',
        ]);

        return response()->json($medication->load(['schedules', 'stock']), 201);
    }

    public function show(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('view', $medication);

        return response()->json($medication->load(['schedules', 'stock']));
    }

    public function update(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('update', $medication);

        $data = $request->validate([
            'name' => 'sometimes|string|max:150',
            // `nullable` além de `sometimes` — precisa aceitar enviar
            // null explícito pra limpar a dosagem de um remédio já
            // cadastrado, não só omitir o campo.
            'dosage' => 'sometimes|nullable|string|max:50',
            'unit' => 'sometimes|string|max:30',
            'color' => 'sometimes|string|regex:/^#[0-9A-Fa-f]{6}$/',
            'instructions' => 'nullable|string',
            'notes' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'is_paused' => 'sometimes|boolean',
            // P4 (§10.4) — mesma justificativa do `store` acima: sem
            // isto, nem criar nem editar o remédio de resgate.
            'is_prn' => 'sometimes|boolean',
            'treatment_duration_days' => 'sometimes|nullable|integer|min:1|max:3650',
        ]);

        // "Pausar não deveria esconder o que já aconteceu" (entrevista
        // de horário, 2026-09-12) — grava o INSTANTE exato da pausa
        // (não só o booleano) pra GenerateScheduleOccurrences saber
        // separar "hoje antes de pausar" (conta) de "hoje depois de
        // pausar" (nunca deveria ter sido gerado). Limpa ao retomar —
        // sem pausa ativa, não há instante nenhum a considerar.
        // Só nas TRANSIÇÕES de verdade — reenviar is_paused=true enquanto
        // já está pausado (ex.: outro campo mudando junto) não pode
        // empurrar `paused_at` pra um instante mais novo à toa.
        if (array_key_exists('is_paused', $data) && $data['is_paused'] !== $medication->is_paused) {
            $data['paused_at'] = $data['is_paused'] ? now() : null;
        }

        // P4 (§10.4) — virar resgate DESPERTA os horários, em vez de só
        // marcar a_bandeira.
        //
        // Achado real, verificado rodando o fluxo inteiro: Losartana com
        // 8h todo dia, marcada como "só quando precisar" — e a tela Hoje
        // CONTINUAVA gerando a dose das 8h, o cron de 15 em 15min
        // marcava essa dose como PERDIDA (derrubando a adesão de quem
        // fez tudo certo), e a tela de cadastro escondia justamente a
        // seção de onde se corrigiria. Pior: a dose apareceria como
        // "previsão" e a pessoa a registraria pelo caminho de dose
        // AGENDADA, entraria no relatório como ocorrência comum e
        // nunca receberia o tratamento de resgate.
        //
        // Desativar (`is_active = false`) e não apagar: o histórico das
        // doses já registradas continua apontando para o horário, e
        // apagar deixaria dose logada órfã.
        //
        // Só na TRANSIÇÃO — reenviar `is_prn` já verdadeiro não deve
        // reescrever os horários.
        $virouResgate = array_key_exists('is_prn', $data)
            && (bool) $data['is_prn'] !== (bool) $medication->is_prn;

        if (array_key_exists('is_paused', $data) && $data['is_paused'] !== $medication->is_paused) {
            $data['paused_at'] = $data['is_paused'] ? now() : null;
        }

        $medication->update($data);

        // Ver o comentário de `$virouResgate` acima: o que faz o
        // remedy virar resgate é também o que DORME os horários.
        if ($virouResgate) {
            $medication->schedules()->update(['is_active' => false]);
        }

        return response()->json($medication->load(['schedules', 'stock']));
    }

    public function destroy(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('delete', $medication);

        // Sem isto, o arquivo ficava órfão no disco pra sempre — apagar
        // o medicamento nunca liberava o espaço da foto.
        $this->deletePhotoFile($medication);

        $medication->delete();

        return response()->json(null, 204);
    }

    // "Foto do medicamento" (2026-08-13) — valor real pro público
    // idoso/cuidador: reconhecer visualmente costuma valer mais que ler
    // o nome. Endpoint separado do update() normal porque upload
    // multipart e JSON de campos de texto são responsabilidades
    // diferentes — mistura os dois só complicaria os dois lados.
    public function uploadPhoto(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('update', $medication);

        $request->validate([
            'photo' => 'required|image|max:5120', // 5MB
        ]);

        try {
            $this->deletePhotoFile($medication);

            $file = $request->file('photo');
            $directory = "medication-photos/{$medication->profile_id}";
            Storage::disk('public')->makeDirectory($directory);

            if (function_exists('imagecreatefromstring') && function_exists('imagewebp')) {
                try {
                    $imageContent = file_get_contents($file->getRealPath());
                    if ($imageContent !== false) {
                        $gdImage = @imagecreatefromstring($imageContent);

                        if ($gdImage !== false) {
                            imagealphablending($gdImage, true);
                            imagesavealpha($gdImage, true);

                            $hash = \Illuminate\Support\Str::random(40);
                            $filename = "{$directory}/{$hash}.webp";

                            ob_start();
                            imagewebp($gdImage, null, 80);
                            $webpData = ob_get_clean();
                            imagedestroy($gdImage);

                            if ($webpData !== false) {
                                Storage::disk('public')->put($filename, $webpData);
                                $medication->update(['photo_path' => $filename]);
                                return response()->json($medication->load(['schedules', 'stock']));
                            }
                        }
                    }
                } catch (\Throwable $gdError) {
                    \Illuminate\Support\Facades\Log::warning('WebP conversion fallback: ' . $gdError->getMessage());
                }
            }

            $path = $file->store($directory, 'public');
            $medication->update(['photo_path' => $path]);

            return response()->json($medication->load(['schedules', 'stock']));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Upload medication photo failed: ' . $e->getMessage(), [
                'exception' => $e,
            ]);

            return response()->json([
                'message' => 'Erro ao salvar a foto do medicamento no servidor: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deletePhoto(Request $request, Medication $medication): JsonResponse
    {
        Gate::authorize('update', $medication);

        $this->deletePhotoFile($medication);
        $medication->update(['photo_path' => null]);

        return response()->json($medication->load(['schedules', 'stock']));
    }

    private function deletePhotoFile(Medication $medication): void
    {
        if ($medication->photo_path) {
            Storage::disk('public')->delete($medication->photo_path);
        }
    }
}
