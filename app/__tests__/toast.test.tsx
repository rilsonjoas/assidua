import React from 'react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, act } from '@testing-library/react-native';
import { Toast } from '../components/Toast';
import { useToastStore } from '../store/toastStore';
import * as Haptics from 'expo-haptics';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

describe('toastStore + Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    act(() => {
      useToastStore.setState({ message: null });
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('não renderiza nada sem mensagem', () => {
    render(<Toast />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it('mostra a mensagem depois de showToast e some sozinho depois de 3.5s', () => {
    render(<Toast />);

    act(() => {
      useToastStore.getState().showToast('Losartana salvo ✓');
    });
    expect(screen.getByText('Losartana salvo ✓')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Losartana salvo ✓')).toBeNull();
  });

  // Achado real (2026-09-02): duas telas podem disparar toast em
  // sequência rápida (ex.: salvar remédio e, na tela seguinte, marcar
  // uma dose) — o timeout da primeira não pode apagar a segunda antes
  // da hora.
  it('uma nova mensagem reinicia o timer em vez de deixar a antiga expirar por cima', () => {
    render(<Toast />);

    act(() => {
      useToastStore.getState().showToast('Primeira');
    });
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    act(() => {
      useToastStore.getState().showToast('Segunda');
    });
    // Passa dos 3.5s da primeira mensagem, mas só 500ms desde a segunda —
    // se o timer antigo não tivesse sido cancelado, a segunda sumiria aqui.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Segunda')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(screen.queryByText('Segunda')).toBeNull();
  });

  // Achado real de uso (2026-09-05): confirmação só visual não bastava
  // pro público idoso — mesmo padrão hático já validado na dose.
  it('showToast vibra por padrão (confirmação em dois canais)', () => {
    render(<Toast />);

    act(() => {
      useToastStore.getState().showToast('Remédio salvo ✓');
    });

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  // A dose (Hoje) gerencia o próprio hático — só vibra na confirmação
  // real do servidor, nunca numa marcação enfileirada offline. Sem essa
  // opção, centralizar o hático aqui dobraria a vibração no caminho
  // online e vibraria de mais no caminho offline.
  it('showToast com { haptic: false } não vibra', () => {
    render(<Toast />);

    act(() => {
      useToastStore.getState().showToast('Dose registrada', { haptic: false });
    });

    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('clearToast esconde a mensagem na hora', () => {
    render(<Toast />);

    act(() => {
      useToastStore.getState().showToast('Algo');
    });
    expect(screen.getByText('Algo')).toBeTruthy();

    act(() => {
      useToastStore.getState().clearToast();
    });
    expect(screen.queryByText('Algo')).toBeNull();
  });
});
