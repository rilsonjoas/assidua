<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

// Login sem senha (2026-08-14) — enviado síncrono no próprio request
// (sem ShouldQueue), de propósito. Achado ao conferir antes de decidir:
// QUEUE_CONNECTION é `database` (padrão do Laravel), mas não existe
// worker nenhum rodando em produção (sem `queue:work`, sem supervisor
// no docker-compose) — nenhum lugar do app usa ShouldQueue hoje.
// Marcar como fila aqui empilharia o job pra sempre sem nunca processar
// — falha invisível, pior que simplesmente mandar na hora.
class MagicLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $plainToken,
        public ?string $redirectOrigin = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Seu link de acesso — Assídua',
        );
    }

    public function content(): Content
    {
        // Achado REAL (2026-08-22, primeiro teste web): url('/auth/...')
        // em contexto HTTP monta pela ROOT DA REQUEST (host puro, sem
        // /api) — o APP_URL com sufixo só vale no console. Resultado:
        // o link do e-mail caía numa rota inexistente (404) tanto no
        // ambiente local quanto possivelmente em produção. Construção
        // explícita, determinística em qualquer ambiente: origem do
        // APP_URL (com ou sem sufixo /api) + prefixo /api real da rota.
        //
        // redirectOrigin (web, W1 2026-08-22): viaja no PRÓPRIO link e é
        // revalidado contra a allowlist no magicLinkRedirect — o e-mail
        // é só transporte, a validação nunca depende dele.
        $base = rtrim((string) config('app.url'), '/');
        if (str_ends_with($base, '/api')) {
            $base = substr($base, 0, -4);
        }
        $url = $base.'/api/auth/magic-link/redirect?token='.$this->plainToken;

        if ($this->redirectOrigin) {
            $url .= '&origin='.urlencode($this->redirectOrigin);
        }

        return new Content(
            view: 'emails.magic-link',
            with: [
                'name' => $this->user->name,
                'url' => $url,
            ],
        );
    }
}
