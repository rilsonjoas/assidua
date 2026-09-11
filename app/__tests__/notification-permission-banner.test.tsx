import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';
import { NotificationPermissionBanner } from '../components/NotificationPermissionBanner';
import * as notificationsService from '../services/notifications';

jest.mock('../services/notifications', () => ({
  getNotificationPermissionStatus: jest.fn(),
}));

const mockedNotifications = jest.mocked(notificationsService);

// "Permissão negada é invisível pra sempre" (2026-09-11, achado real do
// Rilson) — este banner é o que fecha essa lacuna. Reconsulta ao voltar
// pro app (AppState), não só no boot — é assim que alguém revoga de
// verdade (sai, desliga nas configs do sistema, volta).
describe('NotificationPermissionBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  });

  it('não mostra nada enquanto ainda não checou (evita piscar no boot)', () => {
    mockedNotifications.getNotificationPermissionStatus.mockReturnValue(new Promise(() => {})); // nunca resolve
    render(<NotificationPermissionBanner />);

    expect(screen.queryByLabelText('Notificações desligadas, toque pra ativar')).toBeNull();
  });

  it('não mostra nada quando a permissão já está concedida', async () => {
    mockedNotifications.getNotificationPermissionStatus.mockResolvedValue('granted');
    render(<NotificationPermissionBanner />);

    await waitFor(() => expect(mockedNotifications.getNotificationPermissionStatus).toHaveBeenCalled());
    expect(screen.queryByLabelText('Notificações desligadas, toque pra ativar')).toBeNull();
  });

  it('mostra o banner quando a permissão foi negada', async () => {
    mockedNotifications.getNotificationPermissionStatus.mockResolvedValue('denied');
    render(<NotificationPermissionBanner />);

    expect(await screen.findByLabelText('Notificações desligadas, toque pra ativar')).toBeTruthy();
    expect(screen.getByText('Notificações desligadas — você não vai receber lembretes de dose')).toBeTruthy();
  });

  it('mostra o banner quando a permissão ainda não foi decidida (undetermined)', async () => {
    mockedNotifications.getNotificationPermissionStatus.mockResolvedValue('undetermined');
    render(<NotificationPermissionBanner />);

    expect(await screen.findByLabelText('Notificações desligadas, toque pra ativar')).toBeTruthy();
  });

  it('tocar no banner explica como ativar, com botão pra abrir as configurações', async () => {
    mockedNotifications.getNotificationPermissionStatus.mockResolvedValue('denied');
    render(<NotificationPermissionBanner />);

    fireEvent.press(await screen.findByLabelText('Notificações desligadas, toque pra ativar'));

    expect(await screen.findByText('Ativar notificações')).toBeTruthy();
    expect(
      screen.getByText(/Vá em Configurações do aparelho, procure "Notificações" e ative para o Assídua\./),
    ).toBeTruthy();

    fireEvent.press(screen.getByText('Abrir configurações'));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('reconsulta a permissão quando o app volta a ficar ativo (revogado fora do app)', async () => {
    mockedNotifications.getNotificationPermissionStatus.mockResolvedValue('granted');
    render(<NotificationPermissionBanner />);

    await waitFor(() => expect(mockedNotifications.getNotificationPermissionStatus).toHaveBeenCalledTimes(1));

    // A pessoa saiu do app, foi nas configs do sistema e desligou —
    // simulado aqui como a permissão agora vindo 'denied'.
    mockedNotifications.getNotificationPermissionStatus.mockResolvedValue('denied');

    const listeners = (AppState.addEventListener as jest.Mock).mock.calls as unknown[][];
    const changeHandler = listeners.find((call) => call[0] === 'change')?.[1] as (state: string) => void;
    expect(changeHandler).toBeTruthy();

    changeHandler('background');
    changeHandler('active');

    expect(await screen.findByLabelText('Notificações desligadas, toque pra ativar')).toBeTruthy();
    expect(mockedNotifications.getNotificationPermissionStatus).toHaveBeenCalledTimes(2);
  });
});
