import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockScreen from '../app/(tabs)/stock';
import { useProfileStore } from '../store/profileStore';
import { useToastStore } from '../store/toastStore';
import * as medicationsService from '../services/medications';
import * as notificationsService from '../services/notifications';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
  updateStock: jest.fn(),
}));
jest.mock('../services/notifications');

const mockedMedications = jest.mocked(medicationsService);
const mockedNotifications = jest.mocked(notificationsService);

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

const medication = {
  id: 10,
  profile_id: 1,
  name: 'Losartana',
  dosage: '50',
  unit: 'mg',
  color: '#ef4444',
  instructions: null,
  notes: null,
  is_active: true,
  is_paused: false,
  photo_url: null,
  schedules: [],
  stock: { id: 1, medication_id: 10, current_quantity: 5, unit: 'mg', min_alert_quantity: 5, last_updated_at: null },
  days_remaining: 5,
  treatment_duration_days: null,
  treatment_ends_at: null,
};

function renderStock() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StockScreen />
    </QueryClientProvider>,
  );
}

describe('StockScreen — refill alert inteligente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    useToastStore.setState({ message: null });
  });

  it('mostra "Acaba em N dias" pra medicamento com days_remaining baixo', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication]);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.getByText('Acaba em 5 dias')).toBeTruthy();
  });

  // Achado real de uso (2026-09-02): "editar só reescreve — falta
  // adicionar e definir". Cobre as duas ações novas separadamente,
  // porque a semântica de cada uma é diferente (definir usa o número
  // digitado direto; adicionar soma ao que já existia no estoque).
  it('"Definir" substitui o estoque pelo valor digitado', async () => {
    const updated = { ...medication, stock: { ...medication.stock, current_quantity: 30 }, days_remaining: 30 };
    mockedMedications.getMedications
      .mockResolvedValueOnce([medication])
      .mockResolvedValueOnce([updated]);
    mockedMedications.updateStock.mockResolvedValueOnce(updated.stock as any);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByTestId('edit-stock-10'));
    fireEvent.changeText(screen.getByPlaceholderText('Qtd'), '30');
    fireEvent.press(screen.getByText('Definir'));

    await waitFor(() => {
      expect(mockedMedications.updateStock).toHaveBeenCalledWith(10, { current_quantity: 30 });
      expect(mockedNotifications.scheduleRefillAlert).toHaveBeenCalledWith({
        medicationId: 10,
        medicationName: 'Losartana',
        daysRemaining: 30,
        thresholdDays: 7,
      });
      expect(useToastStore.getState().message).toBe('Estoque de Losartana atualizado ✓');
    });
  });

  it('"Adicionar" soma o valor digitado ao estoque atual (5 + 20 = 25), não substitui', async () => {
    const updated = { ...medication, stock: { ...medication.stock, current_quantity: 25 }, days_remaining: 25 };
    mockedMedications.getMedications
      .mockResolvedValueOnce([medication])
      .mockResolvedValueOnce([updated]);
    mockedMedications.updateStock.mockResolvedValueOnce(updated.stock as any);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByTestId('edit-stock-10'));
    // Campo vem pré-preenchido com o valor atual (5) — usuário limpa e
    // digita só a quantidade que está adicionando, não o total.
    fireEvent.changeText(screen.getByPlaceholderText('Qtd'), '20');
    fireEvent.press(screen.getByText('Adicionar'));

    await waitFor(() => {
      expect(mockedMedications.updateStock).toHaveBeenCalledWith(10, { current_quantity: 25 });
    });
  });

  it('"Cancelar" fecha o formulário sem chamar a API', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication]);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByTestId('edit-stock-10'));
    expect(screen.getByPlaceholderText('Qtd')).toBeTruthy();

    fireEvent.press(screen.getByText('Cancelar'));

    expect(screen.queryByPlaceholderText('Qtd')).toBeNull();
    expect(mockedMedications.updateStock).not.toHaveBeenCalled();
    // Botão "Editar" volta a aparecer (estava oculto durante a edição).
    expect(screen.getByTestId('edit-stock-10')).toBeTruthy();
  });

  it('valor inválido não chama a API nem fecha o formulário', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication]);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByTestId('edit-stock-10'));
    fireEvent.changeText(screen.getByPlaceholderText('Qtd'), 'abc');
    fireEvent.press(screen.getByText('Definir'));

    expect(mockedMedications.updateStock).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Qtd')).toBeTruthy();
  });

  // Achado real (2026-09-02): a mutação não tinha `onError` — uma falha
  // de rede ficava muda, sem avisar nada.
  // Achado real de uso (2026-09-05): remédio cadastrado sem preencher
  // "estoque inicial" mostrava "0 unid" igual a um remédio que
  // genuinamente acabou — sem indicar que ninguém informou nada ainda.
  it('estoque zerado e nunca tocado mostra dica pra informar, não "0 unid" liso', async () => {
    const neverSet = { ...medication, stock: { ...medication.stock, current_quantity: 0, last_updated_at: null }, days_remaining: null };
    mockedMedications.getMedications.mockResolvedValue([neverSet]);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.getByText('Estoque não informado — toque em Editar')).toBeTruthy();
    expect(screen.queryByText('0 mg')).toBeNull();
  });

  it('estoque zerado mas já informado antes (acabou de verdade) mostra "0 unid" normal', async () => {
    const ranOut = { ...medication, stock: { ...medication.stock, current_quantity: 0, last_updated_at: '2026-09-01T10:00:00Z' }, days_remaining: 0 };
    mockedMedications.getMedications.mockResolvedValue([ranOut]);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.getByText('0 mg')).toBeTruthy();
    expect(screen.queryByText('Estoque não informado — toque em Editar')).toBeNull();
  });

  it('erro da API mostra alerta e mantém o formulário aberto pra tentar de novo', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication]);
    mockedMedications.updateStock.mockRejectedValueOnce(new Error('network error'));

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByTestId('edit-stock-10'));
    fireEvent.changeText(screen.getByPlaceholderText('Qtd'), '30');
    fireEvent.press(screen.getByText('Definir'));

    await waitFor(() => {
      expect(screen.getByText('Não foi possível atualizar o estoque agora. Tente de novo em instantes.')).toBeTruthy();
    });
    expect(screen.getByPlaceholderText('Qtd')).toBeTruthy();
  });
});
