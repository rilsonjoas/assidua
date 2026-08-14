import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import OnboardingScreen from '../app/(onboarding)/index';
import { useOnboardingStore } from '../store/onboardingStore';
import * as notificationsService from '../services/notifications';
import { router } from 'expo-router';

jest.mock('../services/notifications');

const mockedNotifications = jest.mocked(notificationsService);

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useOnboardingStore.setState({ hasCompletedOnboarding: false });
    mockedNotifications.requestNotificationPermission.mockResolvedValue(true);
  });

  it('avança pelas 3 telas e, na última, pede notificação e conclui', async () => {
    render(<OnboardingScreen />);

    // Achado real testando no dispositivo (2026-08-13): virou ScrollView
    // com paginação (pra dar swipe de verdade), então os 3 textos ficam
    // todos montados ao mesmo tempo — checar getByText(título) sozinho
    // não prova mais avanço nenhum. O pontinho marcado como `selected`
    // é o sinal real de qual etapa está ativa agora.
    expect(screen.getByLabelText('Ir pra etapa 1').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByText('Próximo'));
    expect(screen.getByLabelText('Ir pra etapa 2').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByText('Próximo'));
    expect(screen.getByLabelText('Ir pra etapa 3').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByText('Ativar notificações e começar'));

    await waitFor(() => {
      expect(mockedNotifications.requestNotificationPermission).toHaveBeenCalled();
      expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/');
    });
  });

  it('toque no pontinho pula direto pra etapa correspondente', async () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByLabelText('Ir pra etapa 3'));

    expect(screen.getByLabelText('Ir pra etapa 3').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Ativar notificações e começar')).toBeTruthy();
  });

  it('"Pular" pula direto pro fim sem passar pelas outras telas', async () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Pular'));

    await waitFor(() => {
      expect(mockedNotifications.requestNotificationPermission).toHaveBeenCalled();
      expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/');
    });
  });
});
