<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Sentry\Laravel\Integration;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();

        // Achado real em produção (2026-08-09, pré-existente, não
        // introduzido pela Fase 1.5): sem isto, uma requisição sem
        // Accept: application/json (curl cru, bot, scanner) numa rota
        // protegida derrubava com 500 em vez de 401 — o middleware
        // Authenticate tentava montar a rota nomeada "login" pra
        // redirecionar, que não existe numa API pura. Forçar null
        // garante 401 JSON sempre, sem depender do header do cliente.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withSchedule(function (Schedule $schedule): void {
        // Fase 1.5, Etapa 4 (2026-08-09) — primeiro agendamento deste
        // projeto. Precisa de `* * * * * php artisan schedule:run` no
        // cron do container/VPS pra funcionar de verdade; sem isso o
        // schedule fica só declarado, nunca dispara.
        $schedule->command('doses:check-missed')->everyFifteenMinutes();

        // "Resumo semanal" (Fase 2, 2026-08-13) — hourly() é resolução
        // suficiente pra pegar a janela de 1h (domingo 20h-20:59) de
        // qualquer fuso com offset em hora cheia; o comando decide por
        // perfil se é a hora certa, isto só garante que ele roda.
        $schedule->command('adherence:send-weekly-summary')->hourly();

        // "Duração do tratamento" (2026-08-14) — evento único por
        // medicamento (dedupe via treatment_end_notified_at nulo, não
        // janela de tempo), hourly() dá resolução de sobra sem
        // sobrecarregar à toa.
        $schedule->command('medications:notify-treatment-ending')->hourly();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // No-op enquanto SENTRY_LARAVEL_DSN estiver vazio (config/sentry.php
        // já lê de env, o SDK não envia nada sem DSN configurado).
        Integration::handles($exceptions);
    })->create();
