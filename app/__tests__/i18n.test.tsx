import React from 'react';
import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import i18next from 'i18next';
import LoginScreen from '../app/(auth)/login';

// Prova real de que a troca de idioma funciona ponta a ponta — não só
// que as 3 chaves existem nos JSONs, mas que trocar o idioma ativo do
// i18next muda o texto renderizado. LoginScreen serve de tela de prova
// por ser a mais simples com strings visíveis suficientes pra checar.
describe('i18n — troca de idioma (2026-08-10)', () => {
  afterEach(async () => {
    // i18next é singleton — sem resetar, o idioma trocado aqui vazaria
    // pros outros testes deste arquivo (e, por segurança, garante que
    // este arquivo termina como começou: 'pt', o padrão travado em teste).
    await i18next.changeLanguage('pt');
  });

  it('renderiza em português por padrão no ambiente de teste', () => {
    render(<LoginScreen />);
    expect(screen.getByText('Assídua')).toBeTruthy();
    expect(screen.getByText('Enviar link de acesso')).toBeTruthy();
  });

  it('troca pra inglês e re-renderiza com os textos certos', async () => {
    await i18next.changeLanguage('en');
    render(<LoginScreen />);

    expect(screen.getByText('My Medicines')).toBeTruthy();
    expect(screen.getByText('Send sign-in link')).toBeTruthy();
    expect(screen.getByText("Don't have an account? Sign up")).toBeTruthy();
  });

  it('troca pra espanhol e re-renderiza com os textos certos', async () => {
    await i18next.changeLanguage('es');
    render(<LoginScreen />);

    expect(screen.getByText('Mis Medicinas')).toBeTruthy();
    expect(screen.getByText('Entrar con Google')).toBeTruthy();
  });

  it('idioma não suportado cai no português (fallback)', async () => {
    await i18next.changeLanguage('fr');
    render(<LoginScreen />);

    expect(screen.getByText('Assídua')).toBeTruthy();
  });
});
