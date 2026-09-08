import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoryScreen from '../app/(tabs)/history';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import * as dosesService from '../services/doses';
import * as medicationsService from '../services/medications';

jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getDoseHistory: jest.fn(),
  getWeeklyAdherence: jest.fn(),
  // Calendário de adesão (v1.3, 2026-09-02) — sem mock aqui, a query
  // real do componente resolvia undefined e o react-query reclamava
  // (achado rodando esta suíte depois de adicionar o calendário).
  getDailyAdherence: jest.fn(),
  getConsultationSummary: jest.fn(),
}));
jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));
jest.mock('../lib/reportPdf', () => ({
  exportConsultationReportPdf: jest.fn(),
}));

const mockedDoses = jest.mocked(dosesService);
const mockedMedications = jest.mocked(medicationsService);
const mockedReportPdf = jest.mocked(require('../lib/reportPdf'));

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

const losartana = {
  id: 10, profile_id: 1, name: 'Losartana', dosage: '50', unit: 'mg', color: '#ef4444',
  instructions: null, notes: null, is_active: true, is_paused: false, schedules: [], stock: null, days_remaining: null,
};
const paracetamol = {
  id: 11, profile_id: 1, name: 'Paracetamol', dosage: '750', unit: 'mg', color: '#3b82f6',
  instructions: null, notes: null, is_active: true, is_paused: false, schedules: [], stock: null, days_remaining: null,
};

const logLosartana = {
  id: 100, dose_schedule_id: 1, medication_id: 10, profile_id: 1,
  scheduled_at: '2026-08-12T08:00:00.000Z', taken_at: '2026-08-12T08:05:00.000Z',
  status: 'taken' as const, notes: null,
  medication: losartana,
  dose_schedule: { id: 1, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
};

function renderHistory() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HistoryScreen />
    </QueryClientProvider>,
  );
}

// "Filtro de remédio vira seletor com busca" (2026-09-08) — a UI trocou de
// parede de chips pra um botão único que abre um modal com busca. Os testes
// que antes pressionavam o chip do medicamento direto agora abrem o seletor
// primeiro (pelo accessibilityLabel do botão, que muda com a seleção atual)
// e escolhem a opção dentro do modal.
async function openMedicationPicker() {
  fireEvent.press(await screen.findByLabelText(/^Filtrar por remédio, seleção atual:/));
}

async function selectMedicationInPicker(label: string) {
  await openMedicationPicker();
  fireEvent.press(await screen.findByLabelText(label));
}

describe('HistoryScreen — filtro por medicamento (Fase 2, 2026-08-12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, paracetamol] as any);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
  });

  // Timeout maior que o padrão do Jest (2026-09-08): achado real em CI
  // (GitHub Actions) — este teste faz 3 `findByLabelText` em sequência
  // (botão inicial, abrir modal, achar item dentro dele) mais o
  // `renderHistory()` a frio; sob a suíte cheia num runner mais lento
  // que a máquina local, passou a estourar os 5000ms padrão mesmo
  // passando estável em isolamento e local (2x). Mesma categoria de
  // flakiness por carga já vista antes nesta sessão — não é bug de
  // lógica, é o teste fazendo mais trabalho sequencial que os vizinhos.
  it('botão de filtro começa em "Todos os remédios" e o seletor lista cada medicamento cadastrado', async () => {
    renderHistory();

    expect(await screen.findByLabelText('Filtrar por remédio, seleção atual: Todos os remédios')).toBeTruthy();

    await openMedicationPicker();

    expect(await screen.findByLabelText('Losartana')).toBeTruthy();
    expect(screen.getByLabelText('Paracetamol')).toBeTruthy();
  }, 15000);

  it('ao escolher um medicamento, refaz a busca com medication_id', async () => {
    renderHistory();

    await selectMedicationInPicker('Paracetamol');

    await waitFor(() => {
      expect(mockedDoses.getDoseHistory).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ medication_id: 11 }),
      );
    });
  });

  it('"Todos os remédios" busca sem filtro de medicamento', async () => {
    renderHistory();

    await selectMedicationInPicker('Paracetamol');
    await waitFor(() => expect(mockedDoses.getDoseHistory).toHaveBeenCalledWith(1, expect.objectContaining({ medication_id: 11 })));

    await selectMedicationInPicker('Todos os remédios');

    await waitFor(() => {
      const lastCall = mockedDoses.getDoseHistory.mock.calls.at(-1);
      expect(lastCall?.[1]).not.toHaveProperty('medication_id');
    });
  });

  it('não mostra a linha de filtro de medicamento quando o perfil não tem nenhum', async () => {
    mockedMedications.getMedications.mockResolvedValue([]);

    renderHistory();

    await screen.findByText('Losartana'); // espera a lista carregar (do log, não do filtro)
    expect(screen.queryByLabelText(/^Filtrar por remédio, seleção atual:/)).toBeNull();
  });
});

describe('HistoryScreen — gráfico de adesão (Fase 2, 2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([]);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
  });

  it('mostra uma barra por semana retornada, com o percentual certo', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([
      { week_start: '2026-07-27', week_end: '2026-08-02', percentage: 50, taken: 3, due: 6 },
      { week_start: '2026-08-03', week_end: '2026-08-09', percentage: 100, taken: 7, due: 7 },
    ]);

    renderHistory();

    expect(await screen.findByText('Adesão por semana')).toBeTruthy();
    expect(screen.getByLabelText('50% de adesão nessa semana')).toBeTruthy();
    expect(screen.getByLabelText('100% de adesão nessa semana')).toBeTruthy();
  });

  // Achado real de uso, anotado no Obsidian (2026-08-14): quando
  // *nenhuma* semana tem dado, o gráfico virava uma fileira de
  // barrinhas com "—" sem explicação — parecia quebrado, não "ainda
  // sem dado". Esta era a cobertura antiga (uma semana só, `null`,
  // esperando o rótulo por barra) — a mesma condição que virou o
  // achado. Atualizada pra refletir o comportamento correto: estado
  // vazio explicativo, não fileira de traços.
  it('sem nenhuma semana com dado, mostra estado vazio explicativo (não fileira de "—")', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([
      { week_start: '2026-07-27', week_end: '2026-08-02', percentage: null, taken: 0, due: 0 },
    ]);

    renderHistory();

    expect(await screen.findByText(/Ainda não há doses registradas/)).toBeTruthy();
    expect(screen.queryByLabelText('Sem dados nessa semana')).toBeNull();
  });

  it('semana sem dado, misturada com semana com dado, mostra rótulo de "sem dados" só nela', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([
      { week_start: '2026-07-27', week_end: '2026-08-02', percentage: null, taken: 0, due: 0 },
      { week_start: '2026-08-03', week_end: '2026-08-09', percentage: 100, taken: 7, due: 7 },
    ]);

    renderHistory();

    expect(await screen.findByLabelText('Sem dados nessa semana')).toBeTruthy();
    expect(screen.getByLabelText('100% de adesão nessa semana')).toBeTruthy();
  });

  it('não mostra o gráfico quando não tem nenhuma semana (endpoint vazio)', async () => {
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);

    renderHistory();

    await screen.findByText('Losartana'); // espera a tela terminar de carregar
    expect(screen.queryByText('Adesão por semana')).toBeNull();
  });
});

// "PDF respeita o filtro da tela" (2026-09-08, item 16) — achado real do
// Rilson: o relatório sempre saía fixo (todos os remédios), ignorando o
// filtro por medicamento visível aqui. Confirmação nomeando o recorte
// antes de gerar, não em silêncio.
describe('HistoryScreen — PDF respeita filtro + confirmação (2026-09-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // PDF virou exclusivo Pro (2026-09-08) — esta suíte testa o fluxo de
    // gerar em si, então simula usuário Pro; o gate em si (usuário free)
    // tem suíte própria logo abaixo.
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'pro' } as any });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, paracetamol] as any);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    mockedDoses.getConsultationSummary.mockResolvedValue({ percentage: 90, taken: 9, due: 10, missed: [] } as any);
    mockedReportPdf.exportConsultationReportPdf.mockResolvedValue('file://relatorio.pdf');
  });

  it('sem filtro, a confirmação menciona "todos os medicamentos" e ainda não gerou nada', async () => {
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Gerar Relatório Médico (PDF)'));

    expect(await screen.findByText('Vai gerar o relatório de todos os medicamentos, últimos 30 dias.')).toBeTruthy();
    expect(mockedDoses.getConsultationSummary).not.toHaveBeenCalled();
  });

  it('com um medicamento filtrado, a confirmação nomeia esse medicamento', async () => {
    renderHistory();

    await selectMedicationInPicker('Paracetamol');
    fireEvent.press(screen.getByLabelText('Gerar Relatório Médico (PDF)'));

    expect(await screen.findByText('Vai gerar o relatório de Paracetamol, últimos 30 dias.')).toBeTruthy();
  });

  it('confirmar com medicamento filtrado passa medication_id e o nome do recorte pro PDF', async () => {
    renderHistory();

    await selectMedicationInPicker('Paracetamol');
    fireEvent.press(screen.getByLabelText('Gerar Relatório Médico (PDF)'));
    fireEvent.press(await screen.findByText('Gerar relatório'));

    await waitFor(() => {
      expect(mockedDoses.getConsultationSummary).toHaveBeenCalledWith(1, 30, 11);
      expect(mockedReportPdf.exportConsultationReportPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          medicationName: 'Paracetamol',
          medications: [expect.objectContaining({ name: 'Paracetamol' })],
        }),
      );
    });
  });

  it('confirmar sem filtro passa todos os medicamentos e medicationName null', async () => {
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Gerar Relatório Médico (PDF)'));
    fireEvent.press(await screen.findByText('Gerar relatório'));

    await waitFor(() => {
      expect(mockedDoses.getConsultationSummary).toHaveBeenCalledWith(1, 30, undefined);
      expect(mockedReportPdf.exportConsultationReportPdf).toHaveBeenCalledWith(
        expect.objectContaining({ medicationName: null }),
      );
    });
  });

  it('cancelar a confirmação não gera nada', async () => {
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Gerar Relatório Médico (PDF)'));
    fireEvent.press(screen.getByText('Cancelar'));

    expect(screen.queryByText('Vai gerar o relatório de todos os medicamentos, últimos 30 dias.')).toBeNull();
    expect(mockedDoses.getConsultationSummary).not.toHaveBeenCalled();
  });
});

// "PDF vira exclusivo Pro" (2026-09-08, decisão do Rilson) — usuário
// free vê o botão (com selo "Pro"), mas tocar abre um convite pra
// assinar em vez do fluxo de gerar; "Compartilhar resumo" (texto),
// dados idênticos, continua livre — não testado aqui de novo.
describe('HistoryScreen — PDF exclusivo Pro (2026-09-08)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, paracetamol] as any);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
  });

  it('usuário free vê o selo "Pro" no botão de PDF', async () => {
    renderHistory();

    expect(await screen.findByLabelText('Gerar Relatório Médico em PDF, recurso Pro')).toBeTruthy();
  });

  it('tocar no PDF sem ser Pro convida pra assinar, sem gerar nada', async () => {
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Gerar Relatório Médico em PDF, recurso Pro'));

    expect(await screen.findByText('Relatório em PDF é um recurso Pro')).toBeTruthy();
    expect(mockedDoses.getConsultationSummary).not.toHaveBeenCalled();
  });

  it('confirmar o convite no diálogo navega pra /pro', async () => {
    const { router } = require('expo-router');
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Gerar Relatório Médico em PDF, recurso Pro'));
    fireEvent.press(await screen.findByText('Ver o Pro'));

    expect(router.push).toHaveBeenCalledWith('/pro');
  });

  it('"Compartilhar resumo" continua livre pra usuário free', async () => {
    mockedDoses.getConsultationSummary.mockResolvedValue({ percentage: 90, taken: 9, due: 10, missed: [] } as any);
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Compartilhar resumo pra consulta'));

    await waitFor(() => {
      expect(mockedDoses.getConsultationSummary).toHaveBeenCalled();
    });
  });
});
