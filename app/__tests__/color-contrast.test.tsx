import { describe, it, expect } from '@jest/globals';
import { lightColors, darkColors, highContrastLightColors, highContrastDarkColors, ThemeColors } from '../constants/theme';
import { contrastRatio, bestTextColor } from '../lib/contrast';

// Auditoria de contraste WCAG AA (2026-08-14, pedido direto do Rilson
// por um app o mais "elderly friendly" possível — catarata/baixa visão
// é comum na terceira idade, público real deste app). Sem isso, é fácil
// alguém (inclusive eu, em outra sessão) trocar uma cor "porque ficou
// mais bonita" e derrubar o contraste de novo sem perceber — não tem
// como ver isso só olhando o hex.
//
// Fórmula de luminância relativa e razão de contraste, direto da spec
// do WCAG 2.1 — extraída pra `lib/contrast.ts` (2026-09-05) quando o
// Calendário de Adesão passou a precisar da mesma conta em runtime, não
// só em teste.

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0; // texto grande (18pt+/14pt+negrito) e componentes de UI
const AAA_NORMAL = 7.0;

function checkPairs(colors: ThemeColors, pairs: [keyof ThemeColors, keyof ThemeColors, number][]) {
  for (const [fg, bg, minRatio] of pairs) {
    const ratio = contrastRatio(colors[fg], colors[bg]);
    expect(ratio).toBeGreaterThanOrEqual(minRatio);
  }
}

describe('Contraste de cor — WCAG AA (auditoria 2026-08-14)', () => {
  it('tema claro: texto normal (corpo, links, status) passa 4.5:1', () => {
    checkPairs(lightColors, [
      ['text', 'background', AA_NORMAL],
      ['text', 'surface', AA_NORMAL],
      ['textSecondary', 'background', AA_NORMAL],
      ['textSecondary', 'surface', AA_NORMAL],
      ['brand', 'surface', AA_NORMAL],
      ['brand', 'background', AA_NORMAL],
      ['headerText', 'headerBg', AA_NORMAL],
      ['headerSubtext', 'headerBg', AA_NORMAL],
      ['onBrand', 'brand', AA_NORMAL],
      ['success', 'surface', AA_NORMAL],
      ['warning', 'surface', AA_NORMAL],
    ]);
  });

  it('tema escuro: texto normal passa 4.5:1', () => {
    checkPairs(darkColors, [
      ['text', 'background', AA_NORMAL],
      ['text', 'surface', AA_NORMAL],
      ['textSecondary', 'background', AA_NORMAL],
      ['textSecondary', 'surface', AA_NORMAL],
      ['brand', 'surface', AA_NORMAL],
      ['headerText', 'headerBg', AA_NORMAL],
      ['headerSubtext', 'headerBg', AA_NORMAL],
      ['onBrand', 'brand', AA_NORMAL],
      ['success', 'surface', AA_NORMAL],
      ['warning', 'surface', AA_NORMAL],
    ]);
  });

  // `textMuted` é exceção documentada: é o tom mais claro dos 3 níveis
  // de texto, reservado pra legenda/ícone/decoração — não corpo de
  // texto pequeno crítico (isso usa `textSecondary`, que passa 4.5:1
  // acima). Cobra só o mínimo de texto grande/componente de UI.
  it('textMuted (legenda/ícone, não corpo de texto) passa pelo menos 3:1 nos dois temas', () => {
    checkPairs(lightColors, [
      ['textMuted', 'background', AA_LARGE],
      ['textMuted', 'surface', AA_LARGE],
    ]);
    checkPairs(darkColors, [
      ['textMuted', 'background', AA_LARGE],
      ['textMuted', 'surface', AA_LARGE],
    ]);
  });
});

// Modo Alto Contraste (v1.3, aprovado 2026-09-02) — mira AAA (7:1), não
// só AA. Mesma razão da suíte acima: sem isso, ninguém percebe uma
// paleta "quase lá" só olhando o hex.
const AAA_PAIRS: [keyof ThemeColors, keyof ThemeColors, number][] = [
  ['text', 'background', AAA_NORMAL],
  ['text', 'surface', AAA_NORMAL],
  ['textSecondary', 'background', AAA_NORMAL],
  ['textSecondary', 'surface', AAA_NORMAL],
  // Alto contraste não tem exceção pro textMuted — é o próprio ponto do
  // modo: nada fica abaixo de AAA, nem a legenda mais discreta.
  ['textMuted', 'background', AAA_NORMAL],
  ['textMuted', 'surface', AAA_NORMAL],
  ['brand', 'surface', AAA_NORMAL],
  ['headerText', 'headerBg', AAA_NORMAL],
  ['headerSubtext', 'headerBg', AAA_NORMAL],
  ['onBrand', 'brand', AAA_NORMAL],
  ['success', 'surface', AAA_NORMAL],
  ['warning', 'surface', AAA_NORMAL],
  ['error', 'surface', AAA_NORMAL],
];

describe('Contraste de cor — WCAG AAA (Modo Alto Contraste, v1.3 2026-09-02)', () => {
  it('alto contraste claro: tudo passa 7:1, sem exceção', () => {
    checkPairs(highContrastLightColors, AAA_PAIRS);
  });

  it('alto contraste escuro: tudo passa 7:1, sem exceção', () => {
    checkPairs(highContrastDarkColors, AAA_PAIRS);
  });
});
