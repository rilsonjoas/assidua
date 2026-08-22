<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Seu link de acesso</title>
</head>
<body style="margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding: 32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" style="max-width: 480px;" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="background:#4f46e5; border-radius: 16px 16px 0 0; padding: 24px 28px;">
                            <span style="color:#fff; font-size: 18px; font-weight: 700;">Assídua</span>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#fff; border-radius: 0 0 16px 16px; padding: 28px; color:#1e293b;">
                            <p style="font-size: 16px; margin: 0 0 16px;">Oi, {{ $name }}!</p>
                            <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px; color:#334155;">
                                Toque no botão abaixo, neste mesmo aparelho, pra entrar no Assídua.
                            </p>
                            <table role="presentation" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="border-radius: 10px; background:#4f46e5;">
                                        <a href="{{ $url }}"
                                           style="display:inline-block; padding: 14px 28px; color:#fff; text-decoration:none; font-size: 15px; font-weight: 600;">
                                            Entrar no app
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="font-size: 13px; line-height: 1.6; margin: 28px 0 0; color:#64748b;">
                                Esse link vale por 15 minutos e só funciona uma vez. Se você não pediu isso,
                                pode ignorar este e-mail — sua conta continua segura.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
