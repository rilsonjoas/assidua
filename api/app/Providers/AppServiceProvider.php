<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Events\DiagnosingHealth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Login sem senha (2026-08-14) — substituiu os limiters `login` e
        // `register` (senha não existe mais no fluxo local). Por (email
        // normalizado + IP), não só IP: impede spam de e-mail de link de
        // acesso contra uma conta específica, sem travar um usuário
        // legítimo se outra pessoa na mesma rede (NAT/wifi compartilhado)
        // pedir também. Mais generoso que o antigo `login` (5/min) porque
        // aqui cada tentativa manda um e-mail de verdade, não só falha
        // local — 3/min já é mais que suficiente pro caso legítimo
        // (pediu, não chegou rápido, pediu de novo).
        RateLimiter::for('magic-link', function (Request $request) {
            $key = Str::transliterate(Str::lower((string) $request->input('email'))).'|'.$request->ip();

            return Limit::perMinute(3)->by($key);
        });

        // P2 — Saúde & Resiliência (2026-08-09). `/up` sozinho só
        // confirma "processo de pé" — se o Postgres cair, o app
        // continuaria reportando saudável. `DiagnosingHealth` é o hook
        // oficial do Laravel 11+: se o listener lançar, `/up` responde
        // como não-saudável de verdade.
        Event::listen(function (DiagnosingHealth $event) {
            DB::connection()->getPdo();
        });
    }
}
