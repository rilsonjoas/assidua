import { describe, it, expect } from '@jest/globals';
import { contrastRatio, bestTextColor } from '../lib/contrast';
import { lightColors, darkColors } from '../constants/theme';

// Achado real (2026-09-05, Calendário de Adesão): nenhuma cor de texto
// fixa (só branco, ou só preto) bate 4.5:1 nos 3 tons semânticos × 2
// temas ao mesmo tempo — branco no verde escuro do tema claro passa,
// mas no verde vivo do tema escuro cai pra ~2.3:1. `bestTextColor`
// escolhe caso a caso; este teste prova que a escolha bate AA nos tons
// de verdade usados pelo calendário, não só num exemplo qualquer.
describe('bestTextColor — texto legível em cima de cor semântica variável', () => {
  const AA_NORMAL = 4.5;
  const SEMANTIC_COLORS = {
    'tema claro, success': lightColors.success,
    'tema claro, warning': lightColors.warning,
    'tema claro, error': lightColors.error,
    'tema escuro, success': darkColors.success,
    'tema escuro, warning': darkColors.warning,
    'tema escuro, error': darkColors.error,
  };

  it.each(Object.entries(SEMANTIC_COLORS))('%s: a cor escolhida passa 4.5:1', (_label, bg) => {
    const chosen = bestTextColor(bg);
    expect(contrastRatio(chosen, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('escolhe branco quando branco contrasta mais (verde escuro do tema claro)', () => {
    expect(bestTextColor(lightColors.success)).toBe('#ffffff');
  });

  it('escolhe preto quando preto contrasta mais (verde vivo do tema escuro)', () => {
    expect(bestTextColor(darkColors.success)).toBe('#000000');
  });

  it('preto puro sobre branco puro escolhe preto (o próprio texto)', () => {
    expect(bestTextColor('#ffffff')).toBe('#000000');
  });

  it('branco puro sobre preto puro escolhe branco', () => {
    expect(bestTextColor('#000000')).toBe('#ffffff');
  });
});
