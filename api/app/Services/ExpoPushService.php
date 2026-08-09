<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

// Fase 1.5, Etapa 4. Expo Push API não exige token de acesso pra envio
// básico (só é preciso configurar credencial própria se for usar FCM v1
// direto, fora do escopo aqui) — um POST simples com o push token do
// device já basta. Falha de envio nunca deve derrubar o fluxo que
// chamou (marcar dose como perdida continua valendo mesmo se o push
// falhar) — por isso captura o erro e só loga, não propaga exceção.
class ExpoPushService
{
    private const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

    public function send(string $token, string $title, string $body, array $data = []): bool
    {
        try {
            $response = Http::timeout(5)->post(self::ENDPOINT, [
                'to' => $token,
                'title' => $title,
                'body' => $body,
                'data' => $data,
                'sound' => 'default',
            ]);

            if (! $response->successful()) {
                Log::warning('Falha ao enviar push via Expo', ['status' => $response->status()]);

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning('Exceção ao enviar push via Expo: ' . $e->getMessage());

            return false;
        }
    }
}
