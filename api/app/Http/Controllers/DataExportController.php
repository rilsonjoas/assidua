<?php

namespace App\Http\Controllers;

use App\Actions\DeriveDoseOccurrences;
use App\Models\Profile;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

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
    /**
     * Janela do export. Mesma lei do Histórico (D11): a janela segue o
     * pedido, e isto é o fallback. O export não tem UI para pedir, então
     * aqui a janela é fixa e **vai escrita no arquivo** — quem abre o
     * JSON sabe o que está e o que não está dentro.
     */
    private const EXPORT_WINDOW_DAYS = 90;

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

    public function download(Request $request, DeriveDoseOccurrences $derive)
    {
        // Rota assinada não passa por auth:sanctum — a identidade vem do
        // id embutido na própria URL, cuja assinatura só pode ter sido
        // gerada pelo endpoint autenticado do dono dessa conta. Trocar o
        // id na query invalida a assinatura (403 antes de chegar aqui).
        $user = User::findOrFail((int) $request->query('user'));
        $format = $request->query('format', 'json');

        if ($format === 'csv') {
            return $this->downloadCsv($user, $derive);
        }

        return response()->json($this->payloadFor($user, $derive))
            ->header('Content-Disposition', 'attachment; filename="assidua-dados.json"');
    }

    // Segurança (2026-09-08, achado de auditoria — CSV Formula Injection):
    // nome/dosagem/instruções/notas do medicamento (texto livre digitado
    // pelo próprio usuário) iam direto pra célula do CSV. Se um desses
    // campos começar com =, +, -, ou @, Excel/Sheets pode interpretar
    // como fórmula ao abrir o arquivo. Prefixo de apóstrofo é o padrão
    // OWASP — o Excel mostra o texto literal, sem executar nada.
    private function csvSafe(?string $value): string
    {
        $value ??= '';
        if ($value !== '' && Str::startsWith($value, ['=', '+', '-', '@', "\t", "\r"])) {
            return "'" . $value;
        }
        return $value;
    }

    /**
     * Ocorrências do export, com o estado derivado (P2/§10.2).
     *
     * O export tem a **mesma falha que o Histórico tinha**: ele lia
     * `profiles.medications.doseLogs`, ou seja, só o que JÁ TEM registro.
     * Uma dose prevista que ninguém registrou **não aparece no export** —
     * e este é justamente o documento que a pessoa baixa para conferir o
     * próprio histórico, ou para levar ao médico. Um export que omite o
     * que faltou é pior que um histórico que omite: aqui a omissão é
     * exportada como se fosse complete.
     *
     * A janela é a mesma do Histórico (segue o pedido, 90 dias de
     * fallback) e vai no próprio arquivo, porque o arquivo não tem
     * "estado de erro" pra carregar.
     */
    private function occurrencesFor(Profile $profile, DeriveDoseOccurrences $derive): array
    {
        $to = Carbon::now($profile->timezone);
        $from = $to->copy()->subDays(self::EXPORT_WINDOW_DAYS);

        return $derive->handle($profile, $from, $to);
    }

    private function downloadCsv(User $user, DeriveDoseOccurrences $derive)
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
        ], ';');

        // P2/§10.2: o CSV agora sai das **ocorrências**, não dos logs — e
        // passa a ter os mesmos estados do relatório. `Sem registro` é
        // distinção de verdade: "ninguém registrou" não é a mesma coisa
        // que "marcada como perdida", e num arquivo que a pessoa abre
        // para conferir o próprio histórico, a diferença é o que importa.
        $statusMap = [
            'taken' => 'Tomado',
            'recorded' => 'Tomado',
            'skipped' => 'Pulado',
            'missed' => 'Marcada como perdida',
            'marked_missed' => 'Marcada como perdida',
            'unrecorded' => 'Sem registro',
            'pending' => 'Pendente',
        ];

        $dayMap = [
            0 => 'Dom',
            1 => 'Seg',
            2 => 'Ter',
            3 => 'Qua',
            4 => 'Qui',
            5 => 'Sex',
            6 => 'Sáb',
        ];

        foreach ($user->profiles as $profile) {
            foreach ($profile->medications as $medication) {
                $schedulesText = $medication->schedules->map(function ($s) use ($dayMap) {
                    if ($s->interval_hours !== null) {
                        return "{$s->time} (A cada {$s->interval_hours}h)";
                    }
                    if (!$s->days_of_week || count($s->days_of_week) === 7) {
                        $daysStr = 'Todos os dias';
                    } else {
                        $daysStr = implode(', ', array_map(fn($d) => $dayMap[$d] ?? $d, $s->days_of_week));
                    }
                    return "{$s->time} ({$daysStr})";
                })->implode('; ');

                // P2/§10.2: ocorrências, não logs. Antes o CSV saía de
                // `$medication->doseLogs`, então a dose prevista sem
                // registro não tinha linha nenhuma — e o CSV é o formato
                // que a pessoa abre na planilha para conferir.
                $occurrences = collect($this->occurrencesFor($profile, $derive))
                    ->filter(fn ($o) => $o['medication_id'] === $medication->id);

                if ($occurrences->isNotEmpty()) {
                    foreach ($occurrences as $log) {
                        $scheduledAtFormatted = $log['scheduled_at'] ? date('d/m/Y H:i', strtotime($log['scheduled_at'])) : '';
                        $takenAtFormatted = $log['taken_at'] ? date('d/m/Y H:i', strtotime($log['taken_at'])) : '';
                        $statusFormatted = $statusMap[$log['state']] ?? $statusMap[$log['status']] ?? $log['status'];

                        fputcsv($handle, [
                            $this->csvSafe($profile->name),
                            $this->csvSafe($medication->name),
                            $this->csvSafe($medication->dosage),
                            $this->csvSafe($medication->unit),
                            $this->csvSafe($medication->instructions),
                            $this->csvSafe($medication->notes),
                            $medication->is_paused ? 'Sim' : 'Não',
                            $medication->stock ? $medication->stock->current_quantity : '',
                            $schedulesText,
                            $scheduledAtFormatted,
                            $takenAtFormatted,
                            $statusFormatted,
                        ], ';');
                    }
                } else {
                    fputcsv($handle, [
                        $this->csvSafe($profile->name),
                        $this->csvSafe($medication->name),
                        $this->csvSafe($medication->dosage),
                        $this->csvSafe($medication->unit),
                        $this->csvSafe($medication->instructions),
                        $this->csvSafe($medication->notes),
                        $medication->is_paused ? 'Sim' : 'Não',
                        $medication->stock ? $medication->stock->current_quantity : '',
                        $schedulesText,
                        '',
                        '',
                        '',
                    ], ';');
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

    private function payloadFor(User $user, DeriveDoseOccurrences $derive): array
    {
        return [
            'exported_at' => now()->toIso8601String(),
            // A janela é **dita**. Sem isto, quem abre o JSON não tem como
            // saber se o que falta é "não aconteceu" ou "está fora da
            // janela" — e num documento de portabilidade (LGPD art. 18, V)
            // essa diferença é justamente o que a pessoa precisa poder
            // verificar.
            'window' => [
                'days' => self::EXPORT_WINDOW_DAYS,
                'from' => Carbon::now()->subDays(self::EXPORT_WINDOW_DAYS)->toDateString(),
                'to' => Carbon::now()->toDateString(),
                'note' => 'Ocorrências (não só registros): dose prevista sem registro aparece com state unrecorded.',
            ],
            'account' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'created_at' => $user->created_at?->toIso8601String(),
            ],
            'owned_profiles' => $user->profiles->map(function ($profile) use ($derive) {
                return [
                    'name' => $profile->name,
                    'color' => $profile->color,
                    'avatar_emoji' => $profile->avatar_emoji,
                    'timezone' => $profile->timezone,
                    'medications' => $profile->medications->map(function ($medication) use ($profile, $derive) {
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
                            // Bug de fuso horário (2026-09-09, ver
                            // DoseLog::scheduledAtInTimezone/takenAtInTimezone)
                            // — `$log->scheduled_at`/`taken_at` crus saem
                            // rotulados com o fuso errado (UTC do app, não
                            // o do perfil). No export oficial de dados
                            // (LGPD, portabilidade) isso é ainda mais
                            // grave: é o documento que a pessoa confia pra
                            // ver o próprio histórico real.
                            // P2/§10.2: `dose_logs` lia só o que TEM
                            // registro, e a dose prevista sem registro
                            // simplesmente não existia no export. Aqui são
                            // as **ocorrências**, com o estado derivado
                            // (`recorded`/`skipped`/`unrecorded`/
                            // `marked_missed`) — o mesmo vocabulário do
                            // relatório. `dose_logs` continua na chave
                            // pelo que já tinha, para não quebrar quem
                            // consome o arquivo.
                            'occurrences' => collect($this->occurrencesFor($profile, $derive))
                                ->filter(fn ($o) => $o['medication_id'] === $medication->id)
                                ->map(fn ($o) => [
                                    'scheduled_at' => $o['scheduled_at'],
                                    'taken_at' => $o['taken_at'],
                                    'status' => $o['status'],
                                    'state' => $o['state'],
                                ])
                                ->values(),
                            'dose_logs' => $medication->doseLogs->map(fn ($log) => [
                                'scheduled_at' => $log->scheduledAtInTimezone($profile->timezone)->toISOString(),
                                'taken_at' => $log->takenAtInTimezone($profile->timezone)?->toISOString(),
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
