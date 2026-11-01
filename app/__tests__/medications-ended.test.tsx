import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MedicationsScreen from '../app/(tabs)/medications';
import { useProfileStore } from '../store/profileStore';
import * as medicationsService from '../services/medications';
import * as dosesService from '../services/doses';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));
jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getTodayDoses: jest.fn(),
  logDose: jest.fn(),
}));

const mockedMedications = jest.mocked(medicationsService);
const mockedDoses = jest.mocked(dosesService);

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

function makeMed(overrides: Partial<Record<string, any>>) {
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
    schedules: [{ id: 1, medication_id: 1, time: '08:00:00', days_of_week: [0, 1, 2, 3, 4, 5, 6], interval_hours: null, is_active: true }],
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

describe('MedicationsScreen — Tratamentos encerrados e Alerta PRN', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  });

  it('mostra o cabeçalho sanfona com a contagem de tratamentos encerrados', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMed({ id: 1, name: 'Losartana', is_active: true }),
      makeMed({ id: 2, name: 'Amoxicilina 500mg', is_active: false }),
    ] as any);

    renderScreen();

    expect(await screen.findByText('Tratamentos encerrados')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    // Fechado por padrão: não exibe o cartão encerrado ainda
    expect(screen.queryByText('Amoxicilina 500mg')).toBeNull();
  });

  it('tocar na sanfona expande e exibe o cartão encerrado com selo "Encerrado"', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMed({ id: 1, name: 'Losartana', is_active: true }),
      makeMed({ id: 2, name: 'Amoxicilina 500mg', is_active: false }),
    ] as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Tratamentos encerrados, 1'));

    expect(await screen.findByText('Amoxicilina 500mg')).toBeTruthy();
    expect(screen.getByText('Encerrado')).toBeTruthy();
  });

  it('remédio de resgate (PRN) com estoque baixo exibe alerta "Restam apenas X ..."', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMed({
        id: 3,
        name: 'Dipirona Gotas',
        is_prn: true,
        stock: {
          current_quantity: 3,
          min_alert_quantity: 5,
          unit: 'frascos',
          last_updated_at: '2026-11-01T10:00:00Z',
        },
      }),
    ] as any);

    renderScreen();

    expect(await screen.findByText(/Restam apenas 3 frascos/)).toBeTruthy();
  });

  it('remédio de resgate (PRN) com estoque zerado exibe alerta "Estoque esgotado"', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMed({
        id: 4,
        name: 'Salbutamol Spray',
        is_prn: true,
        stock: {
          current_quantity: 0,
          min_alert_quantity: 5,
          unit: 'doses',
          last_updated_at: '2026-11-01T10:00:00Z',
        },
      }),
    ] as any);

    renderScreen();

    expect(await screen.findByText('Estoque acabou')).toBeTruthy();
  });

  it('remédio de resgate (PRN) exibe botão de 1 toque "Registrar dose" no card e chama logDose', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMed({
        id: 5,
        name: 'Dipirona 500mg',
        is_prn: true,
      }),
    ] as any);
    mockedDoses.logDose.mockResolvedValueOnce({
      id: 101,
      profile_id: 1,
      medication_id: 5,
      dose_schedule_id: null,
      scheduled_at: null,
      taken_at: '2026-11-01T12:00:00Z',
      status: 'taken',
      client_key: 'test-uuid-prn',
      notes: null,
    } as any);

    renderScreen();

    const registerBtn = await screen.findByLabelText('Registrar que tomou Dipirona 500mg');
    expect(registerBtn).toBeTruthy();
    expect(screen.getByText('Registrar dose')).toBeTruthy();

    fireEvent.press(registerBtn);

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 5,
          profile_id: 1,
          status: 'taken',
        }),
      );
    });
  });

  it('remédio PRN com teto diário exibe contagem de doses e avisa com diálogo consciente quando teto for atingido', async () => {
    mockedMedications.getMedications.mockResolvedValue([
      makeMed({
        id: 6,
        name: 'Paracetamol 750mg',
        is_prn: true,
        max_daily_doses: 4,
        today_prn_doses_count: 4,
      }),
    ] as any);
    mockedDoses.logDose.mockResolvedValueOnce({
      id: 102,
      profile_id: 1,
      medication_id: 6,
      dose_schedule_id: null,
      scheduled_at: null,
      taken_at: '2026-11-01T13:00:00Z',
      status: 'taken',
      client_key: 'test-uuid-prn-2',
      notes: null,
    } as any);

    renderScreen();

    // Badge de limite atingido visível no card
    expect(await screen.findByText('Limite atingido (4/4)')).toBeTruthy();
    expect(screen.getByText(/4 de 4 doses hoje/)).toBeTruthy();

    const registerBtn = screen.getByLabelText('Registrar que tomou Paracetamol 750mg');
    fireEvent.press(registerBtn);

    // Diálogo consciente aparece alertando sobre o teto de doses
    expect(await screen.findByText('Limite diário atingido')).toBeTruthy();
    expect(
      screen.getByText(/Você já tomou 4 de 4 doses recomendadas para hoje de Paracetamol 750mg/),
    ).toBeTruthy();

    // Tocar em "Registrar mesmo assim" deve confirmar e registrar
    const confirmAnywayBtn = screen.getByText('Registrar mesmo assim');
    fireEvent.press(confirmAnywayBtn);

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 6,
          profile_id: 1,
          status: 'taken',
        }),
      );
    });
  });
});
