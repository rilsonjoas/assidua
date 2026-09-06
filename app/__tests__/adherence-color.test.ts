import { describe, it, expect } from '@jest/globals';
import { getAdherenceColor } from '../lib/adherence';
import { lightColors } from '../constants/theme';

// Extraído (2026-09-05) de 3 componentes que colavam o mesmo
// `>=80 verde / >=50 amarelo / <50 vermelho` cada um do seu jeito
// (AdherenceRing, AdherenceCalendar, AdherenceChart).
describe('getAdherenceColor', () => {
  it('≥80% é success', () => {
    expect(getAdherenceColor(80, lightColors)).toBe(lightColors.success);
    expect(getAdherenceColor(100, lightColors)).toBe(lightColors.success);
  });

  it('50-79% é warning', () => {
    expect(getAdherenceColor(50, lightColors)).toBe(lightColors.warning);
    expect(getAdherenceColor(79, lightColors)).toBe(lightColors.warning);
  });

  it('<50% é error', () => {
    expect(getAdherenceColor(49, lightColors)).toBe(lightColors.error);
    expect(getAdherenceColor(0, lightColors)).toBe(lightColors.error);
  });
});
