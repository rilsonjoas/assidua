import { describe, it, expect } from '@jest/globals';
import { lightColors, darkColors, ThemeColors } from '../constants/theme';

// Auditoria de contraste WCAG AA (2026-08-14, pedido direto do Rilson
// por um app o mais "elderly friendly" possível — catarata/baixa visão
// é comum na terceira idade, público real deste app). Sem isso, é fácil
// alguém (inclusive eu, em outra sessão) trocar uma cor "porque ficou
// mais bonita" e derrubar o contraste de novo sem perceber — não tem
// como ver isso só olhando o hex.
//
// Fórmula de luminância relativa e razão de contraste, direto da spec
// do WCAG 2.1 (não depende de nenhuma lib nova).

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0; // texto grande (18pt+/14pt+negrito) e componentes de UI

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
