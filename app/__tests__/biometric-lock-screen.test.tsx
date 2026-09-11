import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { BiometricLockScreen } from '../components/BiometricLockScreen';
import { usePrivacyStore } from '../store/privacyStore';
import { useAuthStore } from '../store/authStore';
import { useOnboardingStore } from '../store/onboardingStore';
import * as biometricsService from '../services/biometrics';

jest.mock('../services/biometrics', () => ({
  authenticateWithBiometrics: jest.fn(),
}));

const mockedBiometrics = jest.mocked(biometricsService);

const user = { id: 1, name: 'Rilson', email: 'r@x.com', avatar_url: null, subscription_tier: 'free' as const, has_password: true };

// Bloqueio biométrico (2026-09-11, item 4 da rodada de transparência —
// "bora retomar, com todo cuidado e teste possível"). Só ativa com
// usuário autenticado + onboarding completo (não faz sentido travar a
// tela de login, que não tem nada sensível ainda) — cada cenário testado
// separadamente abaixo, não só o caminho feliz.
describe('BiometricLockScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePrivacyStore.setState({ isBiometricsEnabled: false });
    useAuthStore.setState({ user: null, isLoading: false });
    useOnboardingStore.setState({ hasCompletedOnboarding: false, hasHydrated: true });
  });

  it('não mostra nada quando o bloqueio está desligado', () => {
    usePrivacyStore.setState({ isBiometricsEnabled: false });
    useAuthStore.setState({ user });
    useOnboardingStore.setState({ hasCompletedOnboarding: true });

    render(<BiometricLockScreen />);

    expect(screen.queryByTestId('biometric-lock-overlay')).toBeNull();
    expect(mockedBiometrics.authenticateWithBiometrics).not.toHaveBeenCalled();
  });

  it('não mostra nada sem usuário logado, mesmo com o bloqueio ligado (nada sensível pra proteger ainda)', () => {
    usePrivacyStore.setState({ isBiometricsEnabled: true });
    useAuthStore.setState({ user: null });
    useOnboardingStore.setState({ hasCompletedOnboarding: true });

    render(<BiometricLockScreen />);

    expect(screen.queryByTestId('biometric-lock-overlay')).toBeNull();
    expect(mockedBiometrics.authenticateWithBiometrics).not.toHaveBeenCalled();
  });

  it('não mostra nada antes do onboarding terminar, mesmo logado e com o bloqueio ligado', () => {
    usePrivacyStore.setState({ isBiometricsEnabled: true });
    useAuthStore.setState({ user });
    useOnboardingStore.setState({ hasCompletedOnboarding: false });

    render(<BiometricLockScreen />);

    expect(screen.queryByTestId('biometric-lock-overlay')).toBeNull();
    expect(mockedBiometrics.authenticateWithBiometrics).not.toHaveBeenCalled();
  });

  it('logado + onboarding completo + bloqueio ligado: mostra a tela e pede autenticação sozinho, sem esperar toque', async () => {
    usePrivacyStore.setState({ isBiometricsEnabled: true });
    useAuthStore.setState({ user });
    useOnboardingStore.setState({ hasCompletedOnboarding: true });
    mockedBiometrics.authenticateWithBiometrics.mockReturnValue(new Promise(() => {})); // nunca resolve, pra observar o estado "pedindo"

    render(<BiometricLockScreen />);

    expect(await screen.findByTestId('biometric-lock-overlay')).toBeTruthy();
    await waitFor(() => expect(mockedBiometrics.authenticateWithBiometrics).toHaveBeenCalledTimes(1));
  });

  it('autenticação com sucesso libera a tela (some o overlay)', async () => {
    usePrivacyStore.setState({ isBiometricsEnabled: true });
    useAuthStore.setState({ user });
    useOnboardingStore.setState({ hasCompletedOnboarding: true });
    mockedBiometrics.authenticateWithBiometrics.mockResolvedValueOnce(true);

    render(<BiometricLockScreen />);

    // Timeout maior que o padrão do Jest (mesma categoria de
    // flakiness por carga já documentada em history.test.tsx) — sob a
    // suíte inteira, num runner mais lento, o efeito assíncrono de
    // desbloqueio pode não caber nos 1000ms padrão do `waitFor` mesmo
    // passando estável em isolamento.
    await waitFor(() => expect(screen.queryByTestId('biometric-lock-overlay')).toBeNull(), { timeout: 5000 });
  }, 10000);

  it('falhou/cancelou: continua bloqueado, sem nenhum jeito de pular — só "Tentar de novo"', async () => {
    usePrivacyStore.setState({ isBiometricsEnabled: true });
    useAuthStore.setState({ user });
    useOnboardingStore.setState({ hasCompletedOnboarding: true });
    mockedBiometrics.authenticateWithBiometrics.mockResolvedValueOnce(false);

    render(<BiometricLockScreen />);

    await waitFor(() => expect(mockedBiometrics.authenticateWithBiometrics).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText('Tentar de novo')).toBeTruthy();
    expect(screen.getByTestId('biometric-lock-overlay')).toBeTruthy(); // continua travado

    mockedBiometrics.authenticateWithBiometrics.mockResolvedValueOnce(true);
    fireEvent.press(screen.getByLabelText('Tentar de novo'));

    await waitFor(() => expect(mockedBiometrics.authenticateWithBiometrics).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('biometric-lock-overlay')).toBeNull());
  });
});
