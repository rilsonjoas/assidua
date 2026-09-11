import React from 'react';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ProfileContextBar } from '../components/ProfileContextBar';
import { useProfileStore, Profile } from '../store/profileStore';

// "De quem são esses dados?" em todas as abas (2026-09-11, achado real
// do Rilson: só a Home avisava/deixava trocar de perfil — Histórico,
// Remédios e Estoque não tinham nem aviso nem troca). Extraído da Home
// pra virar 1 componente reusado nas 4 abas.
const own: Profile = {
  id: 1, user_id: 10, name: 'Rilson', color: '#4f46e5', avatar_emoji: 'account',
  is_active: true, is_owner: true,
};
const mother: Profile = {
  id: 2, user_id: 10, name: 'Mãe', color: '#16a34a', avatar_emoji: 'account-heart',
  is_active: true, is_owner: false,
};

describe('ProfileContextBar', () => {
  beforeEach(() => {
    useProfileStore.setState({ profiles: [], activeProfile: null });
  });

  it('não mostra nada com 1 perfil só e sem ser cuidador (caso mais comum)', () => {
    useProfileStore.setState({ profiles: [own], activeProfile: own });

    render(<ProfileContextBar />);

    expect(screen.queryByText('Cuidando de Mãe')).toBeNull();
    expect(screen.queryByLabelText('Perfil Rilson')).toBeNull();
  });

  it('mostra o aviso "Cuidando de {{nome}}" quando o perfil ativo não é o próprio', () => {
    useProfileStore.setState({ profiles: [mother], activeProfile: mother });

    render(<ProfileContextBar />);

    expect(screen.getByLabelText('Cuidando de Mãe')).toBeTruthy();
  });

  it('com mais de 1 perfil, mostra os chips de troca (mesmo sem ser cuidador)', () => {
    useProfileStore.setState({ profiles: [own, mother], activeProfile: own });

    render(<ProfileContextBar />);

    expect(screen.getByLabelText('Perfil Rilson')).toBeTruthy();
    expect(screen.getByLabelText('Perfil Mãe')).toBeTruthy();
  });

  it('tocar num chip troca o perfil ativo', () => {
    useProfileStore.setState({ profiles: [own, mother], activeProfile: own });

    render(<ProfileContextBar />);
    fireEvent.press(screen.getByLabelText('Perfil Mãe'));

    expect(useProfileStore.getState().activeProfile?.id).toBe(2);
  });

  it('o chip do perfil ativo anuncia selecionado pro leitor de tela', () => {
    useProfileStore.setState({ profiles: [own, mother], activeProfile: mother });

    render(<ProfileContextBar />);

    expect(screen.getByLabelText('Perfil Mãe').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Perfil Rilson').props.accessibilityState.selected).toBe(false);
  });
});
