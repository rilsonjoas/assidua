import React from 'react';
import { Share } from 'react-native';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HelpScreen from '../app/help';
import ProfileScreen from '../app/(tabs)/profile';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

// "Ajuda" (2026-08-14) — pergunta direta do Rilson sobre facilitar a
// vida de gente nova no app com algum guia. Tela permanente (não só
// onboarding, que some depois da primeira abertura) + botão de
// compartilhar um resumo em texto simples pro cuidador mandar por
// WhatsApp ou imprimir.
describe('HelpScreen', () => {
  it('mostra todos os tópicos de ajuda', () => {
    render(<HelpScreen />);

    expect(screen.getByText('O que é um perfil?')).toBeTruthy();
    expect(screen.getByText('O que significa cada status de dose?')).toBeTruthy();
    expect(screen.getByText('Como funciona o cuidado compartilhado?')).toBeTruthy();
    expect(screen.getByText('Como funciona o estoque?')).toBeTruthy();
    expect(screen.getByText('Fonte, tema e idioma')).toBeTruthy();
    expect(screen.getByText('Estou configurando pra outra pessoa')).toBeTruthy();
  });

  it('botão "Compartilhar guia" chama o Share nativo com o texto do guia', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    render(<HelpScreen />);

    fireEvent.press(screen.getByLabelText('Compartilhar um guia rápido em texto'));

    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Guia rápido — Assídua') }),
    );
  });
});

describe('ProfileScreen — link pra Ajuda (2026-08-14)', () => {
  const ownProfile = {
    id: 1, user_id: 10, name: 'Rilson', color: '#6366f1',
    avatar_emoji: 'account', is_active: true, is_owner: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });
    useProfileStore.setState({ profiles: [ownProfile], activeProfile: ownProfile });
    jest.mocked(api.get).mockResolvedValue({ data: [ownProfile] });
  });

  it('tocar em "Ajuda" navega pra /help', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ProfileScreen />
      </QueryClientProvider>,
    );

    fireEvent.press(await screen.findByLabelText('Ajuda'));

    expect(router.push).toHaveBeenCalledWith('/help');
  });
});
