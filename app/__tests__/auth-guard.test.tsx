import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { useSegments, router } from 'expo-router';
import { AuthGuard } from '../app/_layout';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStore } from '../store/onboardingStore';
import * as authService from '../services/auth';

jest.mock('../services/auth', () => ({
  getMe: jest.fn(),
}));
jest.mock('../services/notifications', () => ({
  registerPushToken: jest.fn(),
}));

const mockedAuth = jest.mocked(authService);
const mockedUseSegments = useSegments as jest.Mock;

const user = { id: 1, name: 'Rilson', email: 'r@x.com', avatar_url: null, subscription_tier: 'free' as const, has_password: true };

// Achado real de uso (2026-08-14): "toda vez que entro no app aparece
// o onboarding, não só na primeira, isso irrita". `setCompleted()` do
// onboarding já era chamado certinho — o bug era o AuthGuard decidir
// navegar ANTES do zustand-persist terminar de reidratar
// `hasCompletedOnboarding` do AsyncStorage (assíncrono, corrida com o
// boot do app). Não existia teste nenhum cobrindo essa lógica de
// navegação antes disto.
describe('AuthGuard — navegação de onboarding/auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, isLoading: true });
    useOnboardingStore.setState({ hasCompletedOnboarding: false, hasHydrated: false });
    mockedUseSegments.mockReturnValue([]);
  });

  it('não navega enquanto o onboarding-store ainda não reidratou, mesmo com auth já resolvida', async () => {
    mockedAuth.getMe.mockResolvedValue(user);

    render(<AuthGuard />);

    await waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
    // hasHydrated continua false (reidratação "lenta", nunca terminou
    // neste teste) — não deve ter decidido nada ainda.
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('depois que o onboarding-store reidrata com hasCompletedOnboarding=true, não manda pro onboarding', async () => {
    mockedAuth.getMe.mockResolvedValue(user);
    useOnboardingStore.setState({ hasCompletedOnboarding: true, hasHydrated: true });

    render(<AuthGuard />);

    await waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
    await waitFor(() => {
      expect(router.replace).not.toHaveBeenCalledWith('/(onboarding)');
    });
  });

  it('reidratado com hasCompletedOnboarding=false, manda pro onboarding normalmente', async () => {
    mockedAuth.getMe.mockResolvedValue(user);
    useOnboardingStore.setState({ hasCompletedOnboarding: false, hasHydrated: true });

    render(<AuthGuard />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(onboarding)');
    });
  });

  // Rede de segurança: mesmo se por algum outro caminho a pessoa
  // chegar na tela de onboarding já tendo completado antes, o
  // AuthGuard corrige sozinho em vez de prender ali pra sempre.
  it('se cair no onboarding já tendo completado antes, volta pras tabs sozinho', async () => {
    mockedAuth.getMe.mockResolvedValue(user);
    useOnboardingStore.setState({ hasCompletedOnboarding: true, hasHydrated: true });
    mockedUseSegments.mockReturnValue(['(onboarding)']);

    render(<AuthGuard />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/');
    });
  });

  it('sem usuário autenticado, manda pro login independente do onboarding', async () => {
    mockedAuth.getMe.mockResolvedValue(null);
    useOnboardingStore.setState({ hasCompletedOnboarding: false, hasHydrated: true });

    render(<AuthGuard />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
    });
  });
});
