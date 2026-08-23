import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../app/(auth)/login';
import { useAuthStore } from '../store/authStore';
import * as authService from '../services/auth';

jest.mock('../services/auth');

const mockedAuth = jest.mocked(authService);

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, isLoading: false });
  });

  it('pede o link de acesso e mostra a tela de confirmação', async () => {
    mockedAuth.requestMagicLink.mockResolvedValueOnce(undefined);

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.press(screen.getByText('Enviar link de acesso'));

    await waitFor(() => {
      expect(mockedAuth.requestMagicLink).toHaveBeenCalledWith('rilson@example.com');
    });
    expect(await screen.findByText('Link enviado!')).toBeTruthy();
    // Sem token ainda — o login só se completa quando a pessoa toca o
    // link recebido por e-mail (auth-callback.tsx), não nesta tela.
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('mostra alerta genérico quando o envio falha', async () => {
    mockedAuth.requestMagicLink.mockRejectedValueOnce(new Error('erro de rede'));

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.press(screen.getByText('Enviar link de acesso'));

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo —
    // achado do Rilson testando o app de verdade: o alerta cru destoava
    // do resto do design.
    expect(await screen.findByText('Não conseguimos enviar o link. Verifique o e-mail e tente de novo.')).toBeTruthy();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('não chama o serviço se o email estiver vazio', () => {
    render(<LoginScreen />);

    fireEvent.press(screen.getByText('Enviar link de acesso'));

    expect(mockedAuth.requestMagicLink).not.toHaveBeenCalled();
  });

  it('permite voltar da tela de confirmação pra tentar outro e-mail', async () => {
    mockedAuth.requestMagicLink.mockResolvedValueOnce(undefined);

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.press(screen.getByText('Enviar link de acesso'));

    await screen.findByText('Link enviado!');
    fireEvent.press(screen.getByText('Usar outro e-mail'));

    expect(await screen.findByPlaceholderText('Email')).toBeTruthy();
  });
});
