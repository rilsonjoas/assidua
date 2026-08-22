<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', '/api/auth/google/callback'),
    ],

    // Web (W1, 2026-08-22) — origens autorizadas a receber redirect com
    // token no browser, separadas por vírgula. Produção:
    // https://assidua.narniano.com
    'web_auth_origins' => env('WEB_AUTH_ORIGINS', ''),

    'revenuecat' => [
        // Valor definido em Project Settings → Integrations → Webhooks no
        // dashboard do RevenueCat, enviado de volta como header
        // Authorization em toda chamada — é o jeito deles de autenticar o
        // webhook (não é a secret key da API REST). Vazio = webhook
        // recusa tudo (RevenueCatWebhookController::handle).
        'webhook_secret' => env('REVENUECAT_WEBHOOK_SECRET'),
    ],

];
