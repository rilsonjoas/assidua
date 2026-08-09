import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../app/(tabs)/index';
import { useProfileStore } from '../store/profileStore';
import * as dosesService from '../services/doses';
import { api } from '../services/api';

jest.mock('../services/doses');
jest.mock('../services/api', () => ({
  api: { get: jest.fn() },
}));

const mockedDoses = jest.mocked(dosesService);
const mockedApi = jest.mocked(api);

const profile = {
  id: 1,
  user_id: 1,
  name: 'Rilson',
  color: '#6366f1',
  avatar_emoji: 'account',
  is_active: true,
};

const medication = {
  id: 10,
  profile_id: 1,
  name: 'Losartana',
  dosage: '50',
  unit: 'mg',
  color: '#ef4444',
  instructions: null,
  notes: null,
  is_active: true,
  schedules: [],
  stock: null,
  days_remaining: null,
};

const pendingDose = {
  id: 'pending_5',
  dose_schedule_id: 5,
  medication_id: 10,
  profile_id: 1,
  scheduled_at: '2026-08-08T08:00:00.000Z',
  taken_at: null,
  status: 'pending' as const,
  notes: null,
  medication,
  dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
};

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('HomeScreen — marcar dose como tomada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
  });

  it('lista a dose pendente de hoje e marca como tomada ao tocar em "Tomei"', async () => {
    // mockResolvedValue (não `Once`) porque a mutação dispara
    // invalidateQueries no sucesso, o que causa um refetch real da
    // mesma query — precisa responder de novo, não só na primeira vez.
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...pendingDose, status: 'taken' });

    renderHome();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByText('Tomei'));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({
          dose_schedule_id: 5,
          medication_id: 10,
          profile_id: 1,
          status: 'taken',
        }),
      );
    });
  });

  it('mostra estado vazio quando não há perfil ativo ainda', async () => {
    useProfileStore.setState({ profiles: [], activeProfile: null });
    mockedApi.get.mockResolvedValueOnce({ data: [] });

    renderHome();

    expect(await screen.findByText('Nenhum perfil criado')).toBeTruthy();
    expect(mockedDoses.getTodayDoses).not.toHaveBeenCalled();
  });
});

describe('HomeScreen — corrigir dose (desfazer)', () => {
  const takenDose = {
    id: 99,
    dose_schedule_id: 5,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T08:00:00.000Z',
    taken_at: '2026-08-08T08:05:00.000Z',
    status: 'taken' as const,
    notes: null,
    medication,
    dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
  });

  it('desmarca uma dose "Tomado" ao tocar no badge, feito por engano', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([takenDose]);
    mockedDoses.undoDose.mockResolvedValueOnce(undefined);

    renderHome();

    expect(await screen.findByText('Tomado')).toBeTruthy();

    fireEvent.press(screen.getByText('Tomado'));

    await waitFor(() => {
      expect(mockedDoses.undoDose).toHaveBeenCalledWith(99);
    });
  });
});

describe('HomeScreen — refill alert inteligente', () => {
  const lowStockDose = {
    ...pendingDose,
    id: 'pending_5',
    medication: { ...medication, days_remaining: 3 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
  });

  it('mostra banner de estoque acabando quando days_remaining está no limiar', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([lowStockDose]);

    renderHome();

    expect(await screen.findByText(/Estoque acabando: Losartana/)).toBeTruthy();
  });

  it('não mostra banner quando o estoque está confortável', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]); // days_remaining: null no mock base

    renderHome();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.queryByText(/Estoque acabando/)).toBeNull();
  });
});

describe('HomeScreen — status automático "Perdido"', () => {
  const missedDose = {
    id: 42,
    dose_schedule_id: 5,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T08:00:00.000Z',
    taken_at: null,
    status: 'missed' as const,
    notes: null,
    medication,
    dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
  });

  it('mostra "Atrasado" e ainda permite marcar como tomada mesmo perdida', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([missedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...missedDose, status: 'taken' });

    renderHome();

    expect(await screen.findByText('Atrasado')).toBeTruthy();
    expect(screen.getByText('Tomei')).toBeTruthy();

    fireEvent.press(screen.getByText('Tomei'));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 5, status: 'taken' }),
      );
    });
  });
});
