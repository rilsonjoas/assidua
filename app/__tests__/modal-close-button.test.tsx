import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ModalCloseButton } from '../components/ModalCloseButton';

// Achado real de uso (2026-09-02): "botão de editar sem X — quem abre
// achando que vai sair não encontra como". Cobre o único contrato que
// importa aqui: existe um botão com label acessível de fechar, e tocar
// nele volta pra tela anterior.
describe('ModalCloseButton', () => {
  it('tem um botão acessível de fechar', () => {
    render(<ModalCloseButton />);
    expect(screen.getByLabelText('Fechar')).toBeTruthy();
  });

  it('ao tocar, volta pra tela anterior', () => {
    render(<ModalCloseButton />);

    fireEvent.press(screen.getByLabelText('Fechar'));

    expect(router.back).toHaveBeenCalled();
  });
});
