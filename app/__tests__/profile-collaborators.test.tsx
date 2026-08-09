import React from 'react';
import { Share } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from '../app/(tabs)/profile';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import * as collaboratorsService from '../services/collaborators';

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../services/auth', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
}));
jest.mock('../services/collaborators');

const mockedApi = jest.mocked(api);
const mockedCollaborators = jest.mocked(collaboratorsService);

const ownProfile = {
  id: 1,
  user_id: 10,
  name: 'Rilson',
  color: '#6366f1',
  avatar_emoji: 'account',
  is_active: true,
  is_owner: true,
};

const sharedProfile = {
  id: 2,
  user_id: 20,
  name: 'Vovó Maria',
  color: '#ec4899',
  avatar_emoji: 'account-heart',
  is_active: true,
  is_owner: false,
};

function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

describe('ProfileScreen — cuidador remoto (Fase 1.5, Etapa 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com' } as any });
    useProfileStore.setState({ profiles: [ownProfile, sharedProfile], activeProfile: ownProfile });
    mockedApi.get.mockResolvedValue({ data: [ownProfile, sharedProfile] });
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  });

  it('mostra etiqueta "Cuidando de" só no perfil compartilhado', () => {
    renderProfile();

    expect(screen.getByText('Vovó Maria')).toBeTruthy();
    expect(screen.getByText('Cuidando de')).toBeTruthy();
  });

  it('gera convite pro perfil próprio e compartilha o código', async () => {
    mockedCollaborators.createInvite.mockResolvedValueOnce({
      id: 5,
      profile_id: 1,
      invited_by_user_id: 10,
      user_id: null,
      role: 'viewer',
      invite_code: 'AB3D9F2K',
      expires_at: '2026-08-16T00:00:00.000Z',
      accepted_at: null,
      user: null,
    });

    renderProfile();

    fireEvent.press(screen.getByTestId('invite-btn-1'));

    await waitFor(() => {
      expect(mockedCollaborators.createInvite).toHaveBeenCalledWith(1);
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('AB3D9F2K') }),
      );
    });
  });

  it('resgata código de convite e atualiza a lista de perfis', async () => {
    mockedCollaborators.acceptInvite.mockResolvedValueOnce({
      id: 3,
      name: 'Seu Zé',
      color: '#f59e0b',
      avatar_emoji: 'account',
    });

    renderProfile();

    fireEvent.press(screen.getByText('Tenho um código'));
    fireEvent.changeText(screen.getByPlaceholderText('Ex: AB3D9F2K'), 'zz11xx22');
    fireEvent.press(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(mockedCollaborators.acceptInvite).toHaveBeenCalledWith('ZZ11XX22');
      expect(mockedApi.get).toHaveBeenCalledWith('/profiles');
    });
  });
});
