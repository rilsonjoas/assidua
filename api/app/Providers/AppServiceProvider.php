<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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
        // Por (email normalizado + IP), não só IP: impede um único atacante
        // de tentar senha infinitamente contra uma conta, sem travar um
        // usuário legítimo se outra pessoa na mesma rede (NAT/wifi
        // compartilhado) errar a senha algumas vezes. Mesmo padrão do
        // Laravel Fortify.
        RateLimiter::for('login', function (Request $request) {
            $key = Str::transliterate(Str::lower((string) $request->input('email'))).'|'.$request->ip();

            return Limit::perMinute(5)->by($key);
        });

        // Registro: sem email de conta existente pra combinar, então
        // limita por IP — o suficiente pra travar automação/spam de
        // criação de conta.
        RateLimiter::for('register', function (Request $request) {
            return Limit::perMinute(5)->by($request->ip());
        });
    }
}
