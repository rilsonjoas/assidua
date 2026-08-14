import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import ProScreen from '../app/pro';
import { useAuthStore } from '../store/authStore';

// "Plano Pro" (2026-08-13) — tela só explicativa, sem pagamento real
// (L1 continua deliberadamente não implementado). Os números abaixo
// batem com o que o backend já aplica de verdade (MedicationController,
// ProfileController, DoseLogController) — não são valor inventado.
describe('ProScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usuário grátis vê os limites reais e o aviso de "em breve"', () => {
    useAuthStore.setState({ user: { id: 1, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });

    render(<ProScreen />);

    expect(screen.getByText('4')).toBeTruthy(); // perfis grátis
    expect(screen.getByText('15')).toBeTruthy(); // medicamentos grátis
    expect(screen.getByText('30 dias')).toBeTruthy();
    expect(screen.getByText('4 semanas')).toBeTruthy();
    expect(screen.getAllByText('Ilimitado').length).toBe(2); // perfis + medicamentos Pro
    expect(screen.getByText('10 anos')).toBeTruthy();
    expect(screen.getByText('8 semanas')).toBeTruthy();
    expect(screen.getByLabelText('Assinatura do plano Pro em breve')).toBeTruthy();
  });

  it('usuário Pro não vê o aviso de "em breve", vê agradecimento', () => {
    useAuthStore.setState({ user: { id: 1, name: 'Rilson', email: 'r@x.com', subscription_tier: 'pro' } as any });

    render(<ProScreen />);

    expect(screen.getByText('Você já é Pro — obrigado por apoiar o app!')).toBeTruthy();
    expect(screen.queryByLabelText('Assinatura do plano Pro em breve')).toBeNull();
  });
});
