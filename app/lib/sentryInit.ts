// "Sentry local reportando pra produção" (2026-09-08) — achado real:
// rodar o app localmente (`expo start`, `expo start --web`) sempre
// reportava erros pro Sentry de PRODUÇÃO, porque `Sentry.init` só
// olhava se existe DSN configurado, nunca se é um build de
// desenvolvimento. Um 401 esperado de um teste local virou um alerta
// de verdade, notificando gente de verdade.
//
// Extraído em função pura só pra poder testar sem montar `_layout.tsx`
// inteiro (Stack, stores, i18n, etc.) — o efeito colateral de chamar
// `Sentry.init`/`SentryWeb.init` de verdade continua só ali.
export function shouldEnableSentry(dsn: string | undefined, isDev: boolean): boolean {
  return !!dsn && !isDev;
}
