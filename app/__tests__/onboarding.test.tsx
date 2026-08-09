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

    expect(screen.getByText('Cuide de quem você ama')).toBeTruthy();
    fireEvent.press(screen.getByText('Próximo'));

    expect(screen.getByText('Nunca mais esqueça uma dose')).toBeTruthy();
    fireEvent.press(screen.getByText('Próximo'));

    expect(screen.getByText('Lembretes na hora certa')).toBeTruthy();
    fireEvent.press(screen.getByText('Ativar notificações e começar'));

    await waitFor(() => {
      expect(mockedNotifications.requestNotificationPermission).toHaveBeenCalled();
      expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true);
      expect(router.replace).toHaveBeenCalledWith('/(tabs)/');
    });
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
