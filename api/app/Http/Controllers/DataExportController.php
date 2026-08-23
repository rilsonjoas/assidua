<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

// LGPD art. 18, V — portabilidade: o usuário tem direito a receber os
// próprios dados em formato estruturado. Fluxo em duas etapas de
// propósito:
//
//   1) POST /me/export-link (auth:sanctum) → devolve uma URL ASSINADA
//      com validade curta e o id do usuário embutido nos parâmetros
//      (viram parte da assinatura). O download acontece no navegador
//      do dispositivo, que não tem o token Sanctum — assinatura com
//      expiração é o mecanismo certo aqui (mesma família do magic
//      link: segredo impossível de adivinhar + janela mínima).
//   2) GET /me/export (middleware signed, sem auth) → gera o JSON na
//      hora e entrega como anexo.
//
// Sem cache intermediário: o payload é regenerado a cada acesso dentro
// da janela — dados sempre atuais, nada persistido à toa.
class DataExportController extends Controller
{
    public function link(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'format' => 'nullable|string|in:json,csv',
        ]);
        $format = $validated['format'] ?? 'json';

        return response()->json([
            'url' => URL::temporarySignedRoute('me.export', now()->addMinutes(10), [
                'user' => $request->user()->id,
                'format' => $format,
            ]),
        ]);
    }

    public function download(Request $request)
    {
        // Rota assinada não passa por auth:sanctum — a identidade vem do
        // id embutido na própria URL, cuja assinatura só pode ter sido
        // gerada pelo endpoint autenticado do dono dessa conta. Trocar o
        // id na query invalida a assinatura (403 antes de chegar aqui).
        $user = User::findOrFail((int) $request->query('user'));
        $format = $request->query('format', 'json');

        if ($format === 'csv') {
            return $this->downloadCsv($user);
        }

        return response()->json($this->payloadFor($user))
            ->header('Content-Disposition', 'attachment; filename="assidua-dados.json"');
    }

    private function downloadCsv(User $user)
    {
        $user->load(['profiles.medications.schedules', 'profiles.medications.doseLogs', 'profiles.medications.stock']);

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF");

        fputcsv($handle, [
            'Perfil',
            'Medicamento',
            'Dosagem',
            'Unidade',
            'Instruções',
            'Observações',
            'Pausado',
            'Estoque Atual',
            'Horários',
            'Data/Hora Agendada',
            'Data/Hora Tomado',
            'Status Dose',
        ]);

        foreach ($user->profiles as $profile) {
            foreach ($profile->medications as $medication) {
                $schedulesText = $medication->schedules->map(function ($s) {
                    $days = $s->days_of_week ? implode(',', $s->days_of_week) : 'Todos';
                    return "{$s->time} ({$days})";
                })->implode('; ');

                if ($medication->doseLogs->count() > 0) {
                    foreach ($medication->doseLogs as $log) {
                        fputcsv($handle, [
                            $profile->name,
                            $medication->name,
                            $medication->dosage ?? '',
                            $medication->unit ?? '',
                            $medication->instructions ?? '',
                            $medication->notes ?? '',
                            $medication->is_paused ? 'Sim' : 'Não',
                            $medication->stock ? $medication->stock->current_quantity : '',
                            $schedulesText,
                            $log->scheduled_at ?? '',
                            $log->taken_at ?? '',
                            $log->status ?? '',
                        ]);
                    }
                } else {
                    fputcsv($handle, [
                        $profile->name,
                        $medication->name,
                        $medication->dosage ?? '',
                        $medication->unit ?? '',
                        $medication->instructions ?? '',
                        $medication->notes ?? '',
                        $medication->is_paused ? 'Sim' : 'Não',
                        $medication->stock ? $medication->stock->current_quantity : '',
                        $schedulesText,
                        '',
                        '',
                        '',
                    ]);
                }
            }
        }

        rewind($handle);
        $csvContent = stream_get_contents($handle);
        fclose($handle);

        return response($csvContent, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="assidua-dados.csv"',
        ]);
    }

    private function payloadFor(User $user): array
    {
        return [
            'exported_at' => now()->toIso8601String(),
            'account' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'created_at' => $user->created_at?->toIso8601String(),
            ],
            'owned_profiles' => $user->profiles->map(function ($profile) {
                return [
                    'name' => $profile->name,
                    'color' => $profile->color,
                    'avatar_emoji' => $profile->avatar_emoji,
                    'timezone' => $profile->timezone,
                    'medications' => $profile->medications->map(function ($medication) {
                        return [
                            'name' => $medication->name,
                            'dosage' => $medication->dosage,
                            'unit' => $medication->unit,
                            'color' => $medication->color,
                            'instructions' => $medication->instructions,
                            'notes' => $medication->notes,
                            'is_paused' => $medication->is_paused,
                            'treatment_duration_days' => $medication->treatment_duration_days,
                            'stock' => $medication->stock ? [
                                'current_quantity' => $medication->stock->current_quantity,
                                'low_stock_threshold' => $medication->stock->low_stock_threshold,
                            ] : null,
                            'schedules' => $medication->schedules->map(fn ($schedule) => [
                                'time' => $schedule->time,
                                'days_of_week' => $schedule->days_of_week,
                                'interval_hours' => $schedule->interval_hours,
                            ]),
                            'dose_logs' => $medication->doseLogs->map(fn ($log) => [
                                'scheduled_at' => $log->scheduled_at,
                                'taken_at' => $log->taken_at,
                                'status' => $log->status,
                            ]),
                        ];
                    }),
                ];
            }),
            // Perfis que o usuário CUIDA (não é dono): só referências —
            // os dados pertencem ao dono do perfil, quem os exporta é ele.
            'shared_profiles_as_caregiver' => $user->sharedProfiles->map(
                fn ($profile) => ['name' => $profile->name],
            ),
        ];
    }
}
