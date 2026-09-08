import { describe, it, expect } from '@jest/globals';
import { parseStockQuantity, isStockNeverSet } from '../lib/stockQuantity';

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
