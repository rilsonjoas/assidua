import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdherenceCalendar } from '../components/AdherenceCalendar';
import * as dosesService from '../services/doses';

jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getDailyAdherence: jest.fn(),
}));

const mockedDoses = jest.mocked(dosesService);

function renderCalendar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdherenceCalendar profileId={1} />
    </QueryClientProvider>,
  );
}

// "Calendário de adesão" (v1.3, aprovado 2026-09-02). Sem freeze de
// relógio (diferente dos testes PHP/Carbon) — o mês exibido é sempre
// calculado a partir do `new Date()' real no momento do teste, com a
// mesma formatação do componente, pra não depender de que dia é hoje.
describe('AdherenceCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mostra o mês atual no cabeçalho e os 7 rótulos de dia da semana', async () => {
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    renderCalendar();

    const expectedTitle = format(new Date(), 'MMMM yyyy', { locale: ptBR });
    expect(await screen.findByText(new RegExp(expectedTitle, 'i'))).toBeTruthy();
    for (const label of ['D', 'S', 'T', 'Q']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('dia com 100% de adesão é anunciado certo pro leitor de tela', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockedDoses.getDailyAdherence.mockResolvedValue([
      { date: today, percentage: 100, taken: 2, due: 2 },
    ]);

    renderCalendar();

    const day = today.slice(-2).replace(/^0/, '');
    expect(await screen.findByLabelText(`Dia ${day}, 100%, 2 de 2 doses tomadas`)).toBeTruthy();
  });

  it('dia sem schedule devido (due: 0) é anunciado como "sem dado", não como 0%', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockedDoses.getDailyAdherence.mockResolvedValue([
      { date: today, percentage: null, taken: 0, due: 0 },
    ]);

    renderCalendar();

    const day = today.slice(-2).replace(/^0/, '');
    expect(await screen.findByLabelText(`Dia ${day}, sem dado`)).toBeTruthy();
  });

  it('dia com adesão baixa (< 50%) é distinto de dia sem dado', async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    mockedDoses.getDailyAdherence.mockResolvedValue([
      { date: today, percentage: 25, taken: 1, due: 4 },
    ]);

    renderCalendar();

    const day = today.slice(-2).replace(/^0/, '');
    expect(await screen.findByLabelText(`Dia ${day}, 25%, 1 de 4 doses tomadas`)).toBeTruthy();
  });

  it('mostra a legenda com as 4 categorias (ótimo, atenção, baixo, sem dados)', async () => {
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    renderCalendar();

    await screen.findByText('≥80% Ótimo');
    expect(screen.getByText('50-79% Atenção')).toBeTruthy();
    expect(screen.getByText('<50% Baixo')).toBeTruthy();
    expect(screen.getByText('Sem dados')).toBeTruthy();
  });

  it('"Mês anterior" busca o mês passado de novo', async () => {
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    renderCalendar();

    await screen.findByLabelText('Mês anterior');
    fireEvent.press(screen.getByLabelText('Mês anterior'));

    const prevMonthKey = format(subMonths(startOfMonth(new Date()), 1), 'yyyy-MM');
    await waitFor(() => {
      expect(mockedDoses.getDailyAdherence).toHaveBeenCalledWith(1, prevMonthKey);
    });
  });

  it('"Próximo mês" fica desabilitado no mês atual (não deixa ir pro futuro)', async () => {
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    renderCalendar();

    const nextBtn = await screen.findByLabelText('Próximo mês');
    expect(nextBtn.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(nextBtn);

    // Continua chamando só com o mês atual — nunca pediu um mês futuro.
    const currentMonthKey = format(startOfMonth(new Date()), 'yyyy-MM');
    for (const call of mockedDoses.getDailyAdherence.mock.calls) {
      expect(call[1]).toBe(currentMonthKey);
    }
  });
});
