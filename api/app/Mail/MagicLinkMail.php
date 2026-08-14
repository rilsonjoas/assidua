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
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Seu link de acesso — Meus Remédios',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.magic-link',
            with: [
                'name' => $this->user->name,
                'url' => url('/auth/magic-link/redirect?token='.$this->plainToken),
            ],
        );
    }
}
