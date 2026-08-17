import React from 'react';
import { Alert } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import RegisterScreen from '../app/(auth)/register';
import { useAuthStore } from '../store/authStore';
import * as authService from '../services/auth';

jest.mock('../services/auth');

const mockedAuth = jest.mocked(authService);

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, isLoading: false });
  });

  it('pede o link de acesso com nome e email, mostra a tela de confirmação', async () => {
    mockedAuth.requestMagicLink.mockResolvedValueOnce(undefined);

    render(<RegisterScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Nome'), 'Rilson');
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(mockedAuth.requestMagicLink).toHaveBeenCalledWith('rilson@example.com', 'Rilson');
    });
    expect(await screen.findByText('Quase lá!')).toBeTruthy();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('mostra a mensagem de erro vinda da API quando o envio falha', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedAuth.requestMagicLink.mockRejectedValueOnce({
      response: { data: { message: 'Já existe uma conta com esse e-mail.' } },
    });

    render(<RegisterScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Nome'), 'Rilson');
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'rilson@example.com');
    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Erro', 'Já existe uma conta com esse e-mail.');
    });
  });

  it('não chama o serviço se nome ou email estiverem vazios', () => {
    render(<RegisterScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));

    expect(mockedAuth.requestMagicLink).not.toHaveBeenCalled();
  });
});
