import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockScreen from '../app/(tabs)/stock';
import { useProfileStore } from '../store/profileStore';
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
  schedules: [],
  stock: { id: 1, medication_id: 10, current_quantity: 5, unit: 'mg', min_alert_quantity: 5, last_updated_at: null },
  days_remaining: 5,
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
  });

  it('mostra "Acaba em N dias" pra medicamento com days_remaining baixo', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication]);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.getByText('Acaba em 5 dias')).toBeTruthy();
  });

  it('ao salvar nova quantidade, agenda o aviso com o days_remaining recalculado', async () => {
    const updated = { ...medication, stock: { ...medication.stock, current_quantity: 30 }, days_remaining: 30 };
    mockedMedications.getMedications
      .mockResolvedValueOnce([medication]) // primeira renderização
      .mockResolvedValueOnce([updated]); // refetch depois do invalidateQueries no onSuccess
    mockedMedications.updateStock.mockResolvedValueOnce(updated.stock as any);

    renderStock();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByTestId('edit-stock-10'));
    fireEvent.changeText(screen.getByPlaceholderText('Qtd'), '30');
    fireEvent.press(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(mockedMedications.updateStock).toHaveBeenCalledWith(10, { current_quantity: 30 });
      expect(mockedNotifications.scheduleRefillAlert).toHaveBeenCalledWith({
        medicationId: 10,
        medicationName: 'Losartana',
        daysRemaining: 30,
        thresholdDays: 7,
      });
    });
  });
});
