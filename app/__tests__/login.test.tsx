import React from 'react';
import { Alert } from 'react-native';
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

  it('faz login com sucesso e guarda o usuário no store', async () => {
    const user = {
      id: 1,
      name: 'Rilson',
      email: 'rilson@example.com',
      avatar_url: null,
      subscription_tier: 'free' as const,
      has_password: true,
    };
    mockedAuth.login.mockResolvedValueOnce(user);

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Senha'), 'senha1234');
    fireEvent.press(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(mockedAuth.login).toHaveBeenCalledWith('rilson@example.com', 'senha1234');
    });
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it('mostra alerta genérico quando o login falha, sem vazar o motivo real', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedAuth.login.mockRejectedValueOnce(new Error('401 Unauthorized'));

    render(<LoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Senha'), 'senha-errada');
    fireEvent.press(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Erro', 'Email ou senha incorretos.');
    });
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('não chama o serviço de login se email ou senha estiverem vazios', () => {
    render(<LoginScreen />);

    fireEvent.press(screen.getByText('Entrar'));

    expect(mockedAuth.login).not.toHaveBeenCalled();
  });
});
