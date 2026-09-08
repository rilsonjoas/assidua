import { describe, it, expect } from '@jest/globals';
import { shouldEnableSentry } from '../lib/sentryInit';

// "Sentry local reportando pra produção" (2026-09-08) — achado real:
// rodar o app localmente sempre reportava pro Sentry de PRODUÇÃO, sem
// distinguir "isso é um teste local" de "isso é um usuário de
// verdade". Um 401 esperado de um teste local virou alerta real,
// notificando gente de verdade. Este teste é a rede de segurança pra
// esse achado não voltar em silêncio.
describe('shouldEnableSentry', () => {
  it('desabilita em desenvolvimento mesmo com DSN configurado — o bug de hoje', () => {
    expect(shouldEnableSentry('https://exemplo@sentry.io/1', true)).toBe(false);
  });

  it('habilita em build real (não-dev) com DSN configurado', () => {
    expect(shouldEnableSentry('https://exemplo@sentry.io/1', false)).toBe(true);
  });

  it('desabilita sem DSN configurado, mesmo fora de desenvolvimento', () => {
    expect(shouldEnableSentry(undefined, false)).toBe(false);
  });

  it('desabilita sem DSN e em desenvolvimento', () => {
    expect(shouldEnableSentry(undefined, true)).toBe(false);
  });
});
