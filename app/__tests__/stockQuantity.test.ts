import { describe, it, expect } from '@jest/globals';
import {
  parseStockQuantity,
  isStockNeverSet,
  isMedicationLowStock,
  isLegacyDosageStockUnit,
} from '../lib/stockQuantity';

// "Estoque editável em dois lugares" (item 13) — validação extraída de
// app/(tabs)/stock.tsx e app/medication/[id].tsx pra um lugar só
// (achado de revisão de código, 2026-09-08), pra não divergir com o
// tempo se só uma das telas for atualizada.
describe('parseStockQuantity', () => {
  it('aceita números válidos, incluindo zero', () => {
    expect(parseStockQuantity('30')).toBe(30);
    expect(parseStockQuantity('0')).toBe(0);
    expect(parseStockQuantity('2.5')).toBe(2.5);
  });

  it('rejeita negativo, texto não numérico e vazio', () => {
    expect(parseStockQuantity('-5')).toBeNull();
    expect(parseStockQuantity('abc')).toBeNull();
    expect(parseStockQuantity('')).toBeNull();
  });
});

describe('isStockNeverSet', () => {
  it('true quando quantidade é zero e nunca foi atualizado', () => {
    expect(isStockNeverSet({ current_quantity: 0, last_updated_at: null })).toBe(true);
  });

  it('false quando quantidade zerou de verdade (já foi atualizado antes)', () => {
    expect(isStockNeverSet({ current_quantity: 0, last_updated_at: '2026-09-01T10:00:00Z' })).toBe(false);
  });

  it('false quando tem quantidade, mesmo sem last_updated_at', () => {
    expect(isStockNeverSet({ current_quantity: 5, last_updated_at: null })).toBe(false);
  });

  it('false quando estoque é null (medicamento sem stock ainda)', () => {
    expect(isStockNeverSet(null)).toBe(false);
  });
});

describe('isMedicationLowStock', () => {
  it('identifica remédio com horário com days_remaining <= 7', () => {
    expect(isMedicationLowStock({
      days_remaining: 5,
      stock: { current_quantity: 10, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(true);

    expect(isMedicationLowStock({
      days_remaining: 15,
      stock: { current_quantity: 30, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(false);
  });

  it('remédio pausado nunca é estoque baixo (não consome)', () => {
    expect(isMedicationLowStock({
      is_paused: true,
      days_remaining: 3,
      stock: { current_quantity: 3, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(false);
    expect(isMedicationLowStock({
      is_paused: true,
      is_prn: true,
      stock: { current_quantity: 0, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(false);
  });

  it('identifica remédio PRN zerado ou abaixo de min_alert_quantity', () => {
    // PRN com 0 unidades
    expect(isMedicationLowStock({
      is_prn: true,
      days_remaining: null,
      stock: { current_quantity: 0, min_alert_quantity: 5, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(true);

    // PRN com 3 unidades (<= 5)
    expect(isMedicationLowStock({
      is_prn: true,
      days_remaining: null,
      stock: { current_quantity: 3, min_alert_quantity: 5, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(true);

    // PRN com 10 unidades (> 5)
    expect(isMedicationLowStock({
      is_prn: true,
      days_remaining: null,
      stock: { current_quantity: 10, min_alert_quantity: 5, last_updated_at: '2026-09-01T10:00:00Z' },
    })).toBe(false);
  });

  it('ignora estoque nunca configurado (neverSet)', () => {
    expect(isMedicationLowStock({
      is_prn: true,
      days_remaining: null,
      stock: { current_quantity: 0, min_alert_quantity: 5, last_updated_at: null },
    })).toBe(false);
  });
});

describe('isLegacyDosageStockUnit', () => {
  it('detecta unidades clínicas herdadas da dosagem', () => {
    expect(isLegacyDosageStockUnit('mg')).toBe(true);
    expect(isLegacyDosageStockUnit('mcg')).toBe(true);
    expect(isLegacyDosageStockUnit('g')).toBe(true);
    expect(isLegacyDosageStockUnit('MG')).toBe(true);
  });

  it('retorna false para unidades normais de estoque', () => {
    expect(isLegacyDosageStockUnit('comprimidos')).toBe(false);
    expect(isLegacyDosageStockUnit('gotas')).toBe(false);
    expect(isLegacyDosageStockUnit('ml')).toBe(false);
    expect(isLegacyDosageStockUnit(null)).toBe(false);
  });
});

