import React from 'react';
import { Share } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import CollaboratorsScreen from '../app/collaborators';
import { useProfileStore } from '../store/profileStore';
import * as collaboratorsService from '../services/collaborators';

jest.mock('../services/collaborators');

const mockedCollaborators = jest.mocked(collaboratorsService);
const mockedSearchParams = useLocalSearchParams as jest.Mock;

const profile = { id: 1, user_id: 10, name: 'Vovó Maria', color: '#ec4899', avatar_emoji: 'account', is_active: true };

const acceptedCollaborator = {
  id: 5,
  profile_id: 1,
  invited_by_user_id: 10,
  user_id: 20,
  role: 'viewer',
  invite_code: null,
  expires_at: null,
  accepted_at: '2026-08-20T10:00:00.000Z',
  user: { id: 20, name: 'Seu Zé', email: 'ze@x.com' },
};

const pendingCollaborator = {
  id: 6,
  profile_id: 1,
  invited_by_user_id: 10,
  user_id: null,
  role: 'viewer',
  invite_code: 'AB3D9F2K',
  expires_at: '2026-09-15T00:00:00.000Z',
  accepted_at: null,
  user: null,
};

function renderScreen() {
  mockedSearchParams.mockReturnValue({ profileId: '1' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CollaboratorsScreen />
    </QueryClientProvider>,
  );
}

// "Quem tem acesso" (2026-09-08, maior achado da revisão de UI/UX) —
// `listCollaborators`/`revokeCollaborator` já existiam no serviço,
// chamando endpoints reais que já funcionavam, mas nenhuma tela do app
// chamava essas funções. Esta suíte cobre a tela que fecha esse ciclo.
describe('CollaboratorsScreen — listar e revogar acesso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
  });

  it('sem nenhum colaborador, mostra estado vazio explicativo', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([]);

    renderScreen();

    expect(await screen.findByText('Ninguém tem acesso ainda')).toBeTruthy();
  });

  it('lista colaborador aceito com nome/e-mail e convite pendente separado', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([acceptedCollaborator, pendingCollaborator] as any);

    renderScreen();

    expect(await screen.findByText('Seu Zé')).toBeTruthy();
    expect(screen.getByText('ze@x.com')).toBeTruthy();
    expect(screen.getByText('Convite pendente')).toBeTruthy();
  });

  it('revogar um colaborador aceito pede confirmação nomeando a pessoa', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([acceptedCollaborator] as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Revogar acesso de Seu Zé'));

    expect(await screen.findByText('Seu Zé não vai mais conseguir ver nem registrar doses deste perfil.')).toBeTruthy();
    expect(mockedCollaborators.revokeCollaborator).not.toHaveBeenCalled();
  });

  it('confirmar a revogação chama revokeCollaborator com o profile e o colaborador certos', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([acceptedCollaborator] as any);
    mockedCollaborators.revokeCollaborator.mockResolvedValueOnce(undefined);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Revogar acesso de Seu Zé'));
    fireEvent.press(await screen.findByLabelText('Revogar acesso'));

    await waitFor(() => {
      expect(mockedCollaborators.revokeCollaborator).toHaveBeenCalledWith(1, 5);
    });
  });

  it('cancelar convite pendente usa confirmação diferente da de revogar acesso aceito', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([pendingCollaborator] as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Cancelar convite pendente'));

    expect(await screen.findByText('Cancelar este convite?')).toBeTruthy();
  });

  it('convidar cuidador pede confirmação explicando o que a pessoa vai poder fazer, antes de compartilhar', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([]);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Convidar cuidador'));

    expect(await screen.findByText(/vai poder ver os remédios, marcar doses e repor o estoque/)).toBeTruthy();
    expect(mockedCollaborators.createInvite).not.toHaveBeenCalled();
  });

  it('confirmar o convite gera o código e compartilha', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([]);
    mockedCollaborators.createInvite.mockResolvedValueOnce(pendingCollaborator as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Convidar cuidador'));
    fireEvent.press(await screen.findByText('Convidar e compartilhar'));

    await waitFor(() => {
      expect(mockedCollaborators.createInvite).toHaveBeenCalledWith(1);
      expect(Share.share).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('AB3D9F2K') }),
      );
    });
  });

  it('cancelar a confirmação de convite não gera nada', async () => {
    mockedCollaborators.listCollaborators.mockResolvedValue([]);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Convidar cuidador'));
    fireEvent.press(await screen.findByText('Cancelar'));

    expect(mockedCollaborators.createInvite).not.toHaveBeenCalled();
    expect(screen.queryByText('Convidar alguém para cuidar de Vovó Maria?')).toBeNull();
  });
});
