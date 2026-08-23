import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import ProScreen from '../app/pro';
import { useAuthStore } from '../store/authStore';
import * as purchases from '../services/purchases';
import * as auth from '../services/auth';

// "Plano Pro" (2026-08-13, fluxo de compra real ligado em 2026-08-21).
// Os números do plano Free/Pro batem com o que o backend já aplica de
// verdade (MedicationController, ProfileController, DoseLogController)
// — não são valor inventado.
jest.mock('../services/purchases');
jest.mock('../services/auth');

const mockedPurchases = purchases as jest.Mocked<typeof purchases>;
const mockedAuth = auth as jest.Mocked<typeof auth>;

const freeUser = { id: 1, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' as const };

function makePackage(overrides: Partial<any> = {}) {
  return {
    identifier: '$rc_monthly',
    packageType: 'MONTHLY',
    product: { priceString: 'R$ 14,90', title: 'Pro mensal', ...overrides.product },
    ...overrides,
  };
}

describe('ProScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPurchases.isPurchasesConfigured.mockReturnValue(false);
    mockedPurchases.getCurrentOffering.mockResolvedValue(null);
  });

  it('usuário grátis vê os limites reais e o aviso de "em breve" quando não há oferta', async () => {
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    await waitFor(() => screen.getByLabelText('Assinatura do plano Pro em breve'));

    expect(screen.getByText('4')).toBeTruthy(); // perfis grátis
    expect(screen.getByText('15')).toBeTruthy(); // medicamentos grátis
    expect(screen.getByText('30 dias')).toBeTruthy();
    expect(screen.getByText('4 semanas')).toBeTruthy();
    expect(screen.getAllByText('Ilimitado').length).toBe(2); // perfis + medicamentos Pro
    expect(screen.getByText('10 anos')).toBeTruthy();
    expect(screen.getByText('8 semanas')).toBeTruthy();
  });

  it('usuário Pro não vê o aviso de "em breve" nem tenta buscar oferta, vê agradecimento', async () => {
    useAuthStore.setState({ user: { ...freeUser, subscription_tier: 'pro' } as any });

    render(<ProScreen />);
    await waitFor(() => screen.getByText('Você já é Pro — obrigado por apoiar o app!'));

    expect(screen.queryByLabelText('Assinatura do plano Pro em breve')).toBeNull();
    expect(mockedPurchases.getCurrentOffering).not.toHaveBeenCalled();
  });

  it('SDK configurado mas sem pacote disponível ainda mostra "em breve" (realidade pré-L0)', async () => {
    mockedPurchases.isPurchasesConfigured.mockReturnValue(true);
    mockedPurchases.getCurrentOffering.mockResolvedValue({ availablePackages: [] } as any);
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    await waitFor(() => screen.getByLabelText('Assinatura do plano Pro em breve'));
  });

  it('SDK configurado com oferta real mostra botão de assinar com o preço, sem o aviso de "em breve"', async () => {
    mockedPurchases.isPurchasesConfigured.mockReturnValue(true);
    mockedPurchases.getCurrentOffering.mockResolvedValue({
      availablePackages: [makePackage()],
    } as any);
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    await waitFor(() => screen.getByLabelText('Assinar o plano Pro por R$ 14,90'));

    expect(screen.queryByLabelText('Assinatura do plano Pro em breve')).toBeNull();
  });

  it('comprar com sucesso atualiza o usuário (via getMe) e não mostra alerta', async () => {
    mockedPurchases.isPurchasesConfigured.mockReturnValue(true);
    mockedPurchases.getCurrentOffering.mockResolvedValue({
      availablePackages: [makePackage()],
    } as any);
    mockedPurchases.purchasePackage.mockResolvedValue({ customerInfo: {} } as any);
    mockedAuth.getMe.mockResolvedValue({ ...freeUser, subscription_tier: 'pro' } as any);
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    const button = await waitFor(() => screen.getByLabelText('Assinar o plano Pro por R$ 14,90'));
    fireEvent.press(button);

    await waitFor(() => expect(mockedAuth.getMe).toHaveBeenCalled());
    expect(useAuthStore.getState().user?.subscription_tier).toBe('pro');
    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(screen.queryByText('Erro')).toBeNull();
  });

  it('cancelamento pelo usuário não mostra alerta de erro', async () => {
    mockedPurchases.isPurchasesConfigured.mockReturnValue(true);
    mockedPurchases.getCurrentOffering.mockResolvedValue({
      availablePackages: [makePackage()],
    } as any);
    mockedPurchases.purchasePackage.mockRejectedValue({ userCancelled: true });
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    const button = await waitFor(() => screen.getByLabelText('Assinar o plano Pro por R$ 14,90'));
    fireEvent.press(button);

    await waitFor(() => expect(mockedPurchases.purchasePackage).toHaveBeenCalled());
    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(screen.queryByText('Erro')).toBeNull();
    expect(mockedAuth.getMe).not.toHaveBeenCalled();
  });

  it('erro real de compra mostra alerta', async () => {
    mockedPurchases.isPurchasesConfigured.mockReturnValue(true);
    mockedPurchases.getCurrentOffering.mockResolvedValue({
      availablePackages: [makePackage()],
    } as any);
    mockedPurchases.purchasePackage.mockRejectedValue(new Error('falha de rede'));
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    const button = await waitFor(() => screen.getByLabelText('Assinar o plano Pro por R$ 14,90'));
    fireEvent.press(button);

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Erro')).toBeTruthy();
    expect(screen.getByText('Não foi possível concluir a assinatura. Tente novamente.')).toBeTruthy();
  });

  it('restaurar compras sem assinatura anterior mostra alerta', async () => {
    mockedPurchases.isPurchasesConfigured.mockReturnValue(true);
    mockedPurchases.getCurrentOffering.mockResolvedValue({
      availablePackages: [makePackage()],
    } as any);
    mockedPurchases.restorePurchases.mockRejectedValue(new Error('nada pra restaurar'));
    useAuthStore.setState({ user: freeUser as any });

    render(<ProScreen />);
    const restoreButton = await waitFor(() => screen.getByText('Já assinei — restaurar compra'));
    fireEvent.press(restoreButton);

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Erro')).toBeTruthy();
    expect(screen.getByText('Não encontramos nenhuma assinatura pra restaurar.')).toBeTruthy();
  });
});
