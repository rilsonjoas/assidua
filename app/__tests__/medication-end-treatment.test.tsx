import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import MedicationFormScreen from '../app/medication/[id]';
import { useProfileStore } from '../store/profileStore';
import * as medicationsService from '../services/medications';
import * as notificationsService from '../services/notifications';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedication: jest.fn(),
  updateMedication: jest.fn(),
  deleteMedication: jest.fn(),
}));
jest.mock('../services/notifications');
jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getTodayDoses: jest.fn(),
  logDose: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockedMedications = jest.mocked(medicationsService);
const mockedNotifications = jest.mocked(notificationsService);
const mockedSearchParams = useLocalSearchParams as jest.Mock;

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

const activeMedication = {
  id: 10,
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
  schedules: [{ id: 20, medication_id: 10, time: '08:00:00', days_of_week: [1, 2, 3], interval_hours: null, is_active: true }],
  stock: null,
  days_remaining: null,
  treatment_duration_days: null,
  treatment_ends_at: null,
};

const endedMedication = {
  ...activeMedication,
  is_active: false,
};

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationFormScreen />
    </QueryClientProvider>,
  );
}

describe('MedicationFormScreen — Encerrar e reativar tratamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  });

  it('medicamento ativo mostra o botão "Encerrar tratamento"', async () => {
    mockedMedications.getMedication.mockResolvedValue(activeMedication as any);

    renderScreen();

    expect(await screen.findByLabelText('Encerrar tratamento')).toBeTruthy();
  });

  it('tocar em "Encerrar tratamento" abre diálogo de confirmação explicando a preservação do histórico', async () => {
    mockedMedications.getMedication.mockResolvedValue(activeMedication as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Encerrar tratamento'));

    expect(screen.getByText('Encerrar tratamento?')).toBeTruthy();
    expect(screen.getByText(/alarmes serão desativados.*histórico médico e as doses tomadas continuarão salvos/)).toBeTruthy();
    expect(mockedMedications.updateMedication).not.toHaveBeenCalled();
  });

  it('confirmar encerramento desativa o medicamento (is_active: false), cancela notificações e volta', async () => {
    mockedMedications.getMedication.mockResolvedValue(activeMedication as any);
    mockedMedications.updateMedication.mockResolvedValueOnce({ ...activeMedication, is_active: false } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Encerrar tratamento'));

    const confirmButtons = screen.getAllByLabelText('Encerrar tratamento');
    fireEvent.press(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockedMedications.updateMedication).toHaveBeenCalledWith(10, { is_active: false });
      expect(mockedNotifications.cancelScheduleNotifications).toHaveBeenCalledWith(20);
      expect(router.back).toHaveBeenCalled();
    });
  });

  it('medicamento com tratamento encerrado mostra aviso no topo e botão para reativar', async () => {
    mockedMedications.getMedication.mockResolvedValue(endedMedication as any);

    renderScreen();

    expect(await screen.findByText('Tratamento encerrado — alarmes desativados e histórico médico preservado.')).toBeTruthy();
    expect(screen.getAllByLabelText('Reativar tratamento').length).toBeGreaterThan(0);
  });

  it('tocar em "Reativar tratamento" atualiza is_active para true', async () => {
    mockedMedications.getMedication.mockResolvedValue(endedMedication as any);
    mockedMedications.updateMedication.mockResolvedValueOnce({ ...endedMedication, is_active: true } as any);

    renderScreen();

    const reactivateButtons = await screen.findAllByLabelText('Reativar tratamento');
    fireEvent.press(reactivateButtons[0]);

    await waitFor(() => {
      expect(mockedMedications.updateMedication).toHaveBeenCalledWith(10, { is_active: true });
    });
  });
});
