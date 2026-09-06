import React from 'react';
import { StyleSheet } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockScreen from '../app/(tabs)/stock';
import { AdherenceCalendar } from '../components/AdherenceCalendar';
import { useProfileStore } from '../store/profileStore';
import * as medicationsService from '../services/medications';
import * as dosesService from '../services/doses';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));
jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getDailyAdherence: jest.fn(),
}));
jest.mock('../services/notifications');

const mockedMedications = jest.mocked(medicationsService);
const mockedDoses = jest.mocked(dosesService);

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };
const medication = {
  id: 10, profile_id: 1, name: 'Losartana', dosage: '50', unit: 'mg', color: '#ef4444',
  instructions: null, notes: null, is_active: true, is_paused: false, photo_url: null, schedules: [],
  stock: { id: 1, medication_id: 10, current_quantity: 5, unit: 'mg', min_alert_quantity: 5, last_updated_at: null },
  days_remaining: 5, treatment_duration_days: null, treatment_ends_at: null,
};

function minHeightOf(el: any): number {
  return StyleSheet.flatten(el.props.style).minHeight ?? 0;
}

// Achado revisando toque mínimo (WCAG AAA, 48px) — 2026-09-05. Escopado
// só pros elementos introduzidos nesta sessão, não uma auditoria do
// app inteiro (ver ROADMAP.md, item registrado como pendência maior).
describe('Toque mínimo de 48px — elementos novos desta sessão', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  });

  it('botões "Adicionar"/"Definir"/"Cancelar" do estoque têm 48px de altura mínima', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StockScreen />
      </QueryClientProvider>,
    );

    fireEvent.press(await screen.findByTestId('edit-stock-10'));

    // Por accessibilityLabel, não texto+`.parent` — é literalmente o
    // que o leitor de tela usa pra achar o botão, mais robusto do que
    // depender da árvore interna do TouchableOpacity.
    expect(minHeightOf(screen.getByLabelText('Cancelar'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Adicionar ao estoque de Losartana'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Definir estoque de Losartana'))).toBeGreaterThanOrEqual(48);
  });

  it('setas de navegação de mês do calendário têm 48px de altura e largura mínimas', async () => {
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AdherenceCalendar profileId={1} />
      </QueryClientProvider>,
    );

    const prevBtn = await screen.findByLabelText('Mês anterior');
    const flat = StyleSheet.flatten(prevBtn.props.style);
    expect(flat.minHeight).toBeGreaterThanOrEqual(48);
    expect(flat.minWidth).toBeGreaterThanOrEqual(48);
  });
});
