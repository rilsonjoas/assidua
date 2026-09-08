import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MedicationsScreen from '../app/(tabs)/medications';
import { useProfileStore } from '../store/profileStore';
import { useMedicationsSortStore } from '../store/medicationsSortStore';
import * as medicationsService from '../services/medications';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));

const mockedMedications = jest.mocked(medicationsService);

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

function makeMedication(overrides: Partial<Record<string, any>>) {
  return {
    id: 1,
    profile_id: 1,
    name: 'Losartana',
    dosage: '50',
    unit: 'mg',
    color: '#ef4444',
    instructions: null,
    notes: null,
    is_active: true,
    is_paused: false,
    photo_url: null,
    schedules: [],
    stock: null,
    days_remaining: null,
    treatment_duration_days: null,
    treatment_ends_at: null,
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationsScreen />
    </QueryClientProvider>,
  );
}

// "Ordenar por" (2026-09-07, item 11) — achado real do Rilson: nenhuma
// tela ordenava nada, sempre a ordem crua do backend.
describe('MedicationsScreen — ordenar por (2026-09-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    useMedicationsSortStore.setState({ sort: 'alphabetical' });
  });

  it('ordena por nome (alfabética) por padrão', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMedication({ id: 1, name: 'Vitamina D' }),
      makeMedication({ id: 2, name: 'Amoxicilina' }),
      makeMedication({ id: 3, name: 'Losartana' }),
    ] as any);

    renderScreen();

    const names = (await screen.findAllByText(/Vitamina D|Amoxicilina|Losartana/)).map((n) => n.props.children);
    expect(names).toEqual(['Amoxicilina', 'Losartana', 'Vitamina D']);
  });

  it('troca pra "Estoque acabando" e reordena por days_remaining, sem estoque rastreado vai pro fim', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMedication({ id: 1, name: 'Vitamina D', days_remaining: null }),
      makeMedication({ id: 2, name: 'Amoxicilina', days_remaining: 20 }),
      makeMedication({ id: 3, name: 'Losartana', days_remaining: 2 }),
    ] as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Ordenar por: Estoque acabando'));

    await waitFor(() => {
      const names = screen.getAllByText(/Vitamina D|Amoxicilina|Losartana/).map((n) => n.props.children);
      expect(names).toEqual(['Losartana', 'Amoxicilina', 'Vitamina D']);
    });
  });

  it('a escolha de ordenação persiste (mesmo store lido na próxima montagem)', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMedication({ id: 1, name: 'Vitamina D' }),
    ] as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Ordenar por: Estoque acabando'));

    await waitFor(() => {
      expect(useMedicationsSortStore.getState().sort).toBe('stock-low');
    });
  });

  it('sem medicamentos, não mostra os chips de ordenação', async () => {
    mockedMedications.getMedications.mockResolvedValue([]);

    renderScreen();

    await screen.findByText('Nenhum medicamento ainda');
    expect(screen.queryByLabelText('Ordenar por: Alfabética')).toBeNull();
  });
});
