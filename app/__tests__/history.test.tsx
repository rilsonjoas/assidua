import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoryScreen from '../app/(tabs)/history';
import { useProfileStore } from '../store/profileStore';
import * as dosesService from '../services/doses';
import * as medicationsService from '../services/medications';

jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getDoseHistory: jest.fn(),
  getWeeklyAdherence: jest.fn(),
}));
jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));

const mockedDoses = jest.mocked(dosesService);
const mockedMedications = jest.mocked(medicationsService);

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

const losartana = {
  id: 10, profile_id: 1, name: 'Losartana', dosage: '50', unit: 'mg', color: '#ef4444',
  instructions: null, notes: null, is_active: true, is_paused: false, schedules: [], stock: null, days_remaining: null,
};
const paracetamol = {
  id: 11, profile_id: 1, name: 'Paracetamol', dosage: '750', unit: 'mg', color: '#3b82f6',
  instructions: null, notes: null, is_active: true, is_paused: false, schedules: [], stock: null, days_remaining: null,
};

const logLosartana = {
  id: 100, dose_schedule_id: 1, medication_id: 10, profile_id: 1,
  scheduled_at: '2026-08-12T08:00:00.000Z', taken_at: '2026-08-12T08:05:00.000Z',
  status: 'taken' as const, notes: null,
  medication: losartana,
  dose_schedule: { id: 1, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
};

function renderHistory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HistoryScreen />
    </QueryClientProvider>,
  );
}

describe('HistoryScreen — filtro por medicamento (Fase 2, 2026-08-12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, paracetamol] as any);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
  });

  it('mostra um chip por medicamento cadastrado, mais "Todos os remédios"', async () => {
    renderHistory();

    expect(await screen.findByText('Todos os remédios')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por Losartana')).toBeTruthy();
    expect(screen.getByLabelText('Filtrar por Paracetamol')).toBeTruthy();
  });

  it('ao escolher um medicamento, refaz a busca com medication_id', async () => {
    renderHistory();

    fireEvent.press(await screen.findByText('Paracetamol'));

    await waitFor(() => {
      expect(mockedDoses.getDoseHistory).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ medication_id: 11 }),
      );
    });
  });

  it('"Todos os remédios" busca sem filtro de medicamento', async () => {
    renderHistory();

    fireEvent.press(await screen.findByText('Paracetamol'));
    await waitFor(() => expect(mockedDoses.getDoseHistory).toHaveBeenCalledWith(1, expect.objectContaining({ medication_id: 11 })));

    fireEvent.press(screen.getByText('Todos os remédios'));

    await waitFor(() => {
      const lastCall = mockedDoses.getDoseHistory.mock.calls.at(-1);
      expect(lastCall?.[1]).not.toHaveProperty('medication_id');
    });
  });

  it('não mostra a linha de filtro de medicamento quando o perfil não tem nenhum', async () => {
    mockedMedications.getMedications.mockResolvedValue([]);

    renderHistory();

    await screen.findByText('Losartana'); // espera a lista carregar (do log, não do filtro)
    expect(screen.queryByText('Todos os remédios')).toBeNull();
  });
});

describe('HistoryScreen — gráfico de adesão (Fase 2, 2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([]);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
  });

  it('mostra uma barra por semana retornada, com o percentual certo', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([
      { week_start: '2026-07-27', week_end: '2026-08-02', percentage: 50, taken: 3, due: 6 },
      { week_start: '2026-08-03', week_end: '2026-08-09', percentage: 100, taken: 7, due: 7 },
    ]);

    renderHistory();

    expect(await screen.findByText('Adesão por semana')).toBeTruthy();
    expect(screen.getByLabelText('50% de adesão nessa semana')).toBeTruthy();
    expect(screen.getByLabelText('100% de adesão nessa semana')).toBeTruthy();
  });

  // Achado real de uso, anotado no Obsidian (2026-08-14): quando
  // *nenhuma* semana tem dado, o gráfico virava uma fileira de
  // barrinhas com "—" sem explicação — parecia quebrado, não "ainda
  // sem dado". Esta era a cobertura antiga (uma semana só, `null`,
  // esperando o rótulo por barra) — a mesma condição que virou o
  // achado. Atualizada pra refletir o comportamento correto: estado
  // vazio explicativo, não fileira de traços.
  it('sem nenhuma semana com dado, mostra estado vazio explicativo (não fileira de "—")', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([
      { week_start: '2026-07-27', week_end: '2026-08-02', percentage: null, taken: 0, due: 0 },
    ]);

    renderHistory();

    expect(await screen.findByText(/Ainda não há doses registradas/)).toBeTruthy();
    expect(screen.queryByLabelText('Sem dados nessa semana')).toBeNull();
  });

  it('semana sem dado, misturada com semana com dado, mostra rótulo de "sem dados" só nela', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([
      { week_start: '2026-07-27', week_end: '2026-08-02', percentage: null, taken: 0, due: 0 },
      { week_start: '2026-08-03', week_end: '2026-08-09', percentage: 100, taken: 7, due: 7 },
    ]);

    renderHistory();

    expect(await screen.findByLabelText('Sem dados nessa semana')).toBeTruthy();
    expect(screen.getByLabelText('100% de adesão nessa semana')).toBeTruthy();
  });

  it('não mostra o gráfico quando não tem nenhuma semana (endpoint vazio)', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);

    renderHistory();

    await screen.findByText('Losartana'); // espera a tela terminar de carregar
    expect(screen.queryByText('Adesão por semana')).toBeNull();
  });
});
