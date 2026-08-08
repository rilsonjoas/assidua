import React from 'react';
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
  dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, is_active: true },
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
