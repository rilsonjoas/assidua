<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

// L1 — monetização (2026-08-21). Fonte de verdade de "é Pro?" continua
// sendo o backend (User::subscription_tier/subscription_expires_at, já
// existiam antes disso) — o app só reflete o que a API manda, igual já
// fazia. RevenueCat chama esta rota a cada evento de assinatura (compra,
// renovação, cancelamento, expiração); o `app_user_id` do evento É o id
// numérico do usuário Laravel (não um id do RevenueCat) — combinado no
// client via Purchases.logIn(String(user.id)) logo após o login.
//
// Autenticação: RevenueCat não assina o payload por padrão (sem HMAC) —
// o mecanismo deles é mandar de volta, em toda chamada, o header
// Authorization com o valor exato configurado no dashboard
// (Project Settings → Integrations → Webhooks). Não é a secret key da
// API REST (essa nunca deveria estar aqui nem no app).
class RevenueCatWebhookController extends Controller
{
    // Eventos que concedem/renovam acesso Pro. NON_RENEWING_PURCHASE
    // cobre uma eventual compra avulsa ("Pro vitalício") — sem
    // expiration_at_ms, o que já é o formato que User::isPro() trata
    // como acesso permanente (subscription_expires_at null).
    private const GRANTS_PRO = [
        'INITIAL_PURCHASE',
        'RENEWAL',
        'PRODUCT_CHANGE',
        'UNCANCELLATION',
        'NON_RENEWING_PURCHASE',
    ];

    // CANCELLATION não revoga acesso na hora — o usuário cancelou a
    // renovação futura, mas o período já pago continua valendo até
    // expirar de verdade. Só EXPIRATION de fato tira o Pro.
    private const REVOKES_PRO = ['EXPIRATION'];

    public function handle(Request $request): JsonResponse
    {
        $secret = config('services.revenuecat.webhook_secret');

        if (! $secret || $request->header('Authorization') !== $secret) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $event = $request->input('event', []);
        $type = $event['type'] ?? null;
        $appUserId = $event['app_user_id'] ?? null;

        if (! $type || ! $appUserId || ! ctype_digit((string) $appUserId)) {
            Log::warning('RevenueCat webhook: payload sem type/app_user_id numérico', ['event' => $event]);

            return response()->json(['status' => 'ignored']);
        }

        $user = User::find((int) $appUserId);

        if (! $user) {
            // Não é erro nosso — pode ser ambiente sandbox/teste do
            // RevenueCat, ou usuário que já apagou a conta. Responde
            // 200 mesmo assim: RevenueCat reenvia em loop qualquer
            // coisa diferente de 2xx.
            Log::info('RevenueCat webhook: app_user_id sem usuário correspondente', ['app_user_id' => $appUserId, 'type' => $type]);

            return response()->json(['status' => 'ignored']);
        }

        if (in_array($type, self::GRANTS_PRO, true)) {
            $expirationMs = $event['expiration_at_ms'] ?? null;

            $user->update([
                'subscription_tier' => 'pro',
                'subscription_expires_at' => $expirationMs ? Carbon::createFromTimestampMs($expirationMs) : null,
            ]);
        } elseif (in_array($type, self::REVOKES_PRO, true)) {
            $user->update([
                'subscription_tier' => 'free',
                'subscription_expires_at' => null,
            ]);
        } else {
            // CANCELLATION, BILLING_ISSUE, TRANSFER, TEST etc. — não
            // mexe no tier. Registrado só pra auditoria/depuração.
            Log::info('RevenueCat webhook: evento recebido sem ação', ['type' => $type, 'user_id' => $user->id]);
        }

        return response()->json(['status' => 'ok']);
    }
}
