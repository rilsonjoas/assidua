import { describe, it, expect } from '@jest/globals';
import { parseMedication } from '../lib/schemas';

describe('Zod Schemas', () => {
  it('valida com sucesso um objeto de medicamento completo', () => {
    const raw = {
      id: 1,
      profile_id: 10,
      name: 'Dipirona',
      dosage: '500',
      unit: 'mg',
      color: '#4f46e5',
      instructions: 'Tomar com água',
      notes: null,
      is_active: true,
      is_paused: false,
      schedules: [
        { id: 100, medication_id: 1, time: '08:00', days_of_week: [1, 3, 5], is_active: true },
      ],
      stock: { id: 5, medication_id: 1, current_quantity: 20, unit: 'comprimidos', min_alert_quantity: 5 },
      days_remaining: 10,
      photo_url: null,
    };

    const parsed = parseMedication(raw);
    expect(parsed.name).toBe('Dipirona');
    expect(parsed.schedules).toHaveLength(1);
    expect(parsed.stock?.current_quantity).toBe(20);
  });

  it('aplica defaults para campos booleanos e arrays ausentes', () => {
    const minimal = {
      id: 2,
      profile_id: 10,
      name: 'Paracetamol',
      unit: 'mg',
    };

    const parsed = parseMedication(minimal);
    expect(parsed.is_active).toBe(true);
    expect(parsed.is_paused).toBe(false);
    expect(parsed.schedules).toEqual([]);
  });

  it('lança erro ao receber um objeto inválido', () => {
    const invalid = {
      id: 'inválido',
      name: 123,
    };

    expect(() => parseMedication(invalid)).toThrow();
  });
});
