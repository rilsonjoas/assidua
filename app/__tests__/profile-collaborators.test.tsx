import React from 'react';
import { Share } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import ProfileScreen from '../app/(tabs)/profile';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { useFontScaleStore } from '../store/fontScaleStore';
import { useHighContrastStore } from '../store/highContrastStore';
import { useLanguageStore } from '../store/languageStore';
import { api } from '../services/api';
import { logout, deleteAccount } from '../services/auth';
import * as collaboratorsService from '../services/collaborators';
import i18next from 'i18next';

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../services/auth', () => ({
  logout: jest.fn(),
  deleteAccount: jest.fn(),
}));
jest.mock('../services/collaborators');

const mockedApi = jest.mocked(api);
const mockedLogout = jest.mocked(logout);
const mockedDeleteAccount = jest.mocked(deleteAccount);
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

beforeEach(async () => {
  await i18next.changeLanguage('pt');
  useLanguageStore.setState({ mode: 'pt' });
});

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

  // "Quem tem acesso" (2026-09-08) — o botão de convidar direto virou um
  // botão "Cuidadores" que navega pra tela de gerenciamento (lista +
  // revogar + convidar com confirmação); o fluxo de convidar/compartilhar
  // em si passou pra `collaborators.test.tsx`, testado na tela nova.
  it('botão "Cuidadores" navega pra tela de gerenciamento do perfil certo', () => {
    renderProfile();

    fireEvent.press(screen.getByTestId('invite-btn-1'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/collaborators', params: { profileId: '1' } });
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

// Achado real testando no dispositivo (2026-08-13): sair/excluir conta
// usavam Alert.alert nativo, destoando visualmente do resto do app.
// Virou ConfirmDialog temático (ver components/ConfirmDialog.tsx).
describe('ProfileScreen — confirmação de sair/excluir conta (2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com' } as any });
    useProfileStore.setState({ profiles: [ownProfile], activeProfile: ownProfile });
    mockedApi.get.mockResolvedValue({ data: [ownProfile] });
  });

  it('tocar em "Sair da conta" abre o diálogo, mas não sai antes de confirmar', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Sair da conta'));

    expect(screen.getByText('Tem certeza que deseja sair?')).toBeTruthy();
    expect(mockedLogout).not.toHaveBeenCalled();
  });

  it('confirmar no diálogo chama logout de verdade', async () => {
    mockedLogout.mockResolvedValueOnce(undefined);

    renderProfile();

    fireEvent.press(await screen.findByLabelText('Sair da conta'));
    fireEvent.press(screen.getByLabelText('Sair'));

    await waitFor(() => {
      expect(mockedLogout).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  it('cancelar no diálogo não chama logout', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Sair da conta'));
    fireEvent.press(screen.getByLabelText('Cancelar'));

    expect(mockedLogout).not.toHaveBeenCalled();
    expect(screen.queryByText('Tem certeza que deseja sair?')).toBeNull();
  });

  it('confirmar exclusão de conta sem senha chama deleteAccount direto', async () => {
    mockedDeleteAccount.mockResolvedValueOnce(undefined);

    renderProfile();

    fireEvent.press(await screen.findByLabelText('Excluir conta'));
    fireEvent.press(screen.getByLabelText('Continuar'));

    await waitFor(() => {
      expect(mockedDeleteAccount).toHaveBeenCalledWith(undefined);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});

// "Plano Pro" (2026-08-13) — etiqueta de plano vira link pra tela de
// benefícios, em vez de só um texto solto sem contexto.
describe('ProfileScreen — link pro plano Pro (2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });
    useProfileStore.setState({ profiles: [ownProfile], activeProfile: ownProfile });
    mockedApi.get.mockResolvedValue({ data: [ownProfile] });
  });

  it('tocar na etiqueta de plano navega pra /pro', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Seu plano: Plano Gratuito. Toque para ver os benefícios do Pro'));

    expect(router.push).toHaveBeenCalledWith('/pro');
  });
});

describe('ProfileScreen — tamanho da fonte (2026-08-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });
    useProfileStore.setState({ profiles: [ownProfile], activeProfile: ownProfile });
    useFontScaleStore.setState({ mode: 'normal' });
    mockedApi.get.mockResolvedValue({ data: [ownProfile] });
  });

  it('começa em Normal selecionado', async () => {
    renderProfile();

    const normalBtn = await screen.findByLabelText('Tamanho da fonte Normal');
    expect(normalBtn.props.accessibilityState.selected).toBe(true);
  });

  it('tocar em Grande marca a nova seleção e salva no store', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Tamanho da fonte Grande'));

    expect(useFontScaleStore.getState().mode).toBe('large');
    const grandeBtn = await screen.findByLabelText('Tamanho da fonte Grande');
    expect(grandeBtn.props.accessibilityState.selected).toBe(true);
    const normalBtn = await screen.findByLabelText('Tamanho da fonte Normal');
    expect(normalBtn.props.accessibilityState.selected).toBe(false);
  });

  it('tocar em Extra Grande salva no store', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Tamanho da fonte Extra Grande'));

    expect(useFontScaleStore.getState().mode).toBe('extraLarge');
  });
});

describe('ProfileScreen — Alto Contraste (v1.3, aprovado 2026-09-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });
    useProfileStore.setState({ profiles: [ownProfile], activeProfile: ownProfile });
    useHighContrastStore.setState({ isHighContrast: false });
    mockedApi.get.mockResolvedValue({ data: [ownProfile] });
  });

  it('começa desligado, anunciado como switch desmarcado', async () => {
    renderProfile();

    const toggle = await screen.findByLabelText('Alto Contraste');
    expect(toggle.props.accessibilityRole).toBe('switch');
    expect(toggle.props.accessibilityState.checked).toBe(false);
    // Escopado no próprio toggle (2026-09-11, achado real rodando a
    // suíte inteira): "Desativado" (`common.off`) deixou de ser único
    // na tela — a nova linha "Modo Privacidade" (sempre visível agora,
    // ver `app/(tabs)/profile.tsx`) também mostra o mesmo texto quando
    // desligada. `within` evita o teste depender de quantas OUTRAS
    // linhas "Desativado" existem na tela, hoje ou no futuro.
    expect(within(toggle).getByText('Desativado')).toBeTruthy();
  });

  // Achado real de uso (2026-09-06): "funcionou, mas seria bom um modal
  // de confirmação pra ninguém clicar sem querer" — tocar no toggle
  // agora abre confirmação em vez de trocar na hora.
  it('tocar abre confirmação em vez de trocar na hora', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Alto Contraste'));

    expect(useHighContrastStore.getState().isHighContrast).toBe(false);
    expect(await screen.findByText('As cores do app vão mudar pra um visual de contraste bem mais forte. Quer ativar?')).toBeTruthy();
  });

  it('confirmar liga o modo e atualiza o texto de estado', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Alto Contraste'));
    fireEvent.press(await screen.findByLabelText('Confirmar'));

    expect(useHighContrastStore.getState().isHighContrast).toBe(true);
    const toggle = await screen.findByLabelText('Alto Contraste');
    expect(toggle.props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('Ativado')).toBeTruthy();
  });

  it('cancelar na confirmação não muda nada', async () => {
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Alto Contraste'));
    fireEvent.press(await screen.findByLabelText('Cancelar'));

    expect(useHighContrastStore.getState().isHighContrast).toBe(false);
    const toggle = await screen.findByLabelText('Alto Contraste');
    expect(toggle.props.accessibilityState.checked).toBe(false);
  });

  it('confirmar de novo desliga (é um toggle, não só liga) — mensagem muda pra "desativar"', async () => {
    useHighContrastStore.setState({ isHighContrast: true });
    renderProfile();

    fireEvent.press(await screen.findByLabelText('Alto Contraste'));

    expect(await screen.findByText('As cores do app vão voltar ao normal. Quer desativar o Alto Contraste?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Confirmar'));

    expect(useHighContrastStore.getState().isHighContrast).toBe(false);
  });
});
