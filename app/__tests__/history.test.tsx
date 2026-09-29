import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HistoryScreen from '../app/(tabs)/history';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { usePrivacyStore } from '../store/privacyStore';
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
  // P3: edição da nota na linha.
  updateDoseNote: jest.fn(),
}));
jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));
jest.mock('../services/offlineQueue', () => ({
  ...(jest.requireActual('../services/offlineQueue') as object),
  listPending: jest.fn(),
}));
jest.mock('../lib/reportPdf', () => ({
  exportConsultationReportPdf: jest.fn(),
}));

const mockedDoses = jest.mocked(dosesService);
const mockedMedications = jest.mocked(medicationsService);
const mockedReportPdf = jest.mocked(require('../lib/reportPdf'));
const mockedQueue = jest.mocked(require('../services/offlineQueue'));

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

// Reset global do modo privado (P1/§9.2, 2026-09-25). O store é global e
// nenhum bloco o reiniciava: um teste que liga o modo privado vaza
// `isPrivate: true` para todos os testes seguintes do ARQUIVO, e eles
// falham com symptomas que não têm nada a ver com privacidade. Jest roda
// o beforeEach externo antes dos internos, então este vale como piso para
// todos os blocos.
beforeEach(() => {
  usePrivacyStore.setState({ isPrivate: false });
});

describe('HistoryScreen — filtro por medicamento (Fase 2, 2026-08-12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, paracetamol] as any);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana] } as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    mockedQueue.listPending.mockResolvedValue([]);
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

// 9.5b e 9.5c (2026-09-25). Duas mentiras no mesmo card de resumo:
//
//  · "Perdidas" era `total - taken` = `skipped + missed`, então PULAR DE
//    PROPÓSITO virava "perdida" — enquanto o relatório do médico exclui
//    `skipped` por decisão explícita ("decisão informada não é falha").
//  · O "% de adesão" é sobre os 50 registros da página 1, não sobre o
//    histórico. A correção de raiz é estrutural e vai para a P2; o que o
//    app pode fazer agora é PARAR de mentir em silêncio.
describe('HistoryScreen — o card de resumo não mente (9.5b e 9.5c)', () => {
  const doseCom = (status: 'taken' | 'skipped' | 'missed', i: number) => ({
    id: 1000 + i,
    dose_schedule_id: 20,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: `2026-08-${String(20 - (i % 5)).padStart(2, '0')}T08:00:00Z`,
    taken_at: status === 'taken' ? '2026-08-20T08:05:00Z' : null,
    status,
    notes: null,
    medication: losartana,
    dose_schedule: { id: 20, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, paracetamol] as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    mockedQueue.listPending.mockResolvedValue([]);
  });

  it('9.5b: "Perdidas" conta só o que é perdida — pular de propósito não vira perda', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [
        doseCom('taken', 0), doseCom('taken', 1),
        doseCom('skipped', 2),
        doseCom('missed', 3),
      ],
    } as any);

    renderHistory();

    // 2 tomadas, 1 pulada, 1 perdida. A conta antiga (4 - 2) diria 2
    // "Perdidas", o que contaria a dose pulada como perda.
    // O item do card anuncia valor e rótulo juntos (9.5b), então a
    // asserção é sobre o que a pessoa realmente ouve.
    expect(await screen.findByLabelText('Perdidas: 1')).toBeTruthy();
    expect(screen.queryByLabelText('Perdidas: 2')).toBeNull();
    expect(screen.getByLabelText('Tomadas: 2')).toBeTruthy();
  });

  it('9.5b: quando ninguém pulou, "Perdidas" bate com o total menos tomadas', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [doseCom('taken', 0), doseCom('taken', 1), doseCom('missed', 2), doseCom('missed', 3)],
    } as any);

    renderHistory();

    expect(await screen.findByLabelText('Perdidas: 2')).toBeTruthy();
    expect(screen.getByLabelText('Tomadas: 2')).toBeTruthy();
  });

  // P2/§10.2 — o Histórico devolve OCORRÊNCIAS, e uma dose prevista que
  // ninguém registrou chega com `unrecorded`. Ela **não pode** cair no
  // fallback de `missed`: sem esta entrada no STATUS_CONFIG, o
  // `?? STATUS_CONFIG.missed` a pintaria de vermelho com o rótulo
  // "Perdida". É a mesma mentira do 9.5b por outro caminho — e este
  // teste é a trava.
  it('dose sem registro NÃO aparece como "Perdida" em vermelho', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [
        { ...doseCom('taken', 0), state: 'recorded' },
        { ...doseCom('missed', 1), state: 'marked_missed' },
        {
          ...doseCom('unrecorded' as never, 2),
          state: 'unrecorded',
          taken_at: null,
        },
      ],
    } as any);

    renderHistory();

    // Uma "Perdida" só: a dose sem registro não entra na contagem.
    expect(await screen.findByLabelText('Perdidas: 1')).toBeTruthy();
    // E ela é rotulada como ausência de informação, não como veredito.
    expect(await screen.findByText('Sem registro')).toBeTruthy();
  });

  it('derivada sem o campo state continua certa (backend antigo / cache offline)', async () => {
    // Contra um backend uma versão atrás, `state` não vem. O app não pode
    // depender dele para ser correto — daí o `derivedState` com
    // mapeamento explícito, e não um `?? status` ingênuo (que compararia
    // 'missed' com 'marked_missed' e daria 0).
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [
        { ...doseCom('taken', 0) },
        { ...doseCom('missed', 1) },
      ],
    } as any);

    renderHistory();

    expect(await screen.findByLabelText('Perdidas: 1')).toBeTruthy();
  });

  // P3 (2026-09-25) — a nota por escrito é **fato clínico** e estava
  // invisível: a API aceitava `notes` desde sempre, o relatório agora
  // mostra, mas a lista do Histórico não. Quem escreveu a nota não
  // conseguia relê-la, e quem usava leitor de tela não recebia a única
  // pista de uma reação adversa.
  it('mostra a nota escrita na dose, e ela entra no rotulo do leitor de tela', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: 'Senti um pouco de tontura.' }],
    } as any);

    renderHistory();

    expect(await screen.findByText('Senti um pouco de tontura.')).toBeTruthy();
    // E no `rowLabel` — a nota não é informação só de quem enxerga.
    expect(
      await screen.findByLabelText(/nota: Senti um pouco de tontura/),
    ).toBeTruthy();
  });

  // ── P3: editar a nota na linha (segunda parte da decisão) ──

  it('a linha tem "Anotar" SEMPRE visivel, mesmo sem nota', async () => {
    // Esconder atrás de toque longo seria função sem pista visual. E a
    // nota é a única forma de a pessoa corrigir o registro com a própria
    // voz — o app não pode decidir que ela não tem o que dizer.
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: null }],
    } as any);

    renderHistory();

    expect(await screen.findByLabelText('Anotar')).toBeTruthy();
  });

  it('editar a nota atualiza a lista na hora (otimista) e manda pro backend', async () => {
    mockedDoses.updateDoseNote.mockResolvedValue({ id: 1000, notes: 'corrigida' } as any);
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: 'versao antiga' }],
    } as any);

    renderHistory();

    expect(await screen.findByText('versao antiga')).toBeTruthy();
    fireEvent.press(await screen.findByText('Editar anotação'));
    fireEvent.changeText(await screen.findByLabelText('Editar a anotação desta dose'), 'versao nova');
    fireEvent.press(screen.getByLabelText('Salvar anotação'));

    await waitFor(() => {
      expect(mockedDoses.updateDoseNote).toHaveBeenCalledWith(1000, 'versao nova');
    });
  });

  it('falha ao salvar ROLLA BACK: a nota volta, nao fica um relato que nao foi salvo', async () => {
    // Esta é a garantia que importa neste campo: a nota vai para o
    // médico. Deixar na tela um relato que não foi gravado seria o pior
    // bug possível aqui.
    mockedDoses.updateDoseNote.mockRejectedValue(new Error('Network Error'));
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: 'versao original' }],
    } as any);

    renderHistory();

    fireEvent.press(await screen.findByText('Editar anotação'));
    fireEvent.changeText(await screen.findByLabelText('Editar a anotação desta dose'), 'isto nao salvou');
    fireEvent.press(screen.getByLabelText('Salvar anotação'));

    await waitFor(() => {
      expect(mockedDoses.updateDoseNote).toHaveBeenCalled();
    });
    // A tela volta ao que o servidor tinha.
    await waitFor(() => {
      expect(screen.getByText('versao original')).toBeTruthy();
    });
  });

  it('limpar o texto APAGA a nota (null, nao string vazia)', async () => {
    mockedDoses.updateDoseNote.mockResolvedValue({ id: 1000, notes: null } as any);
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: 'para apagar' }],
    } as any);

    renderHistory();

    fireEvent.press(await screen.findByText('Editar anotação'));
    fireEvent.changeText(await screen.findByLabelText('Editar a anotação desta dose'), '   ');
    fireEvent.press(screen.getByLabelText('Salvar anotação'));

    await waitFor(() => {
      expect(mockedDoses.updateDoseNote).toHaveBeenCalledWith(1000, null);
    });
  });

  it('a acao de editar a nota e alcancavel por leitor de tela (accessibilityAction)', async () => {
    // P3: a linha é UM nó acessível, então o botão dentro dela não é
    // alcançável por toque de leitor de tela — a solução é expor a ação
    // na própria linha. Este teste cobre o caminho de quem não enxerga:
    // se a `accessibilityAction` sumir, o botão "Editar" fica sendo
    // alcançável **só** pelo toque, que é o bug que a revisão de
    // acessibilidade proíbe.
    mockedDoses.updateDoseNote.mockResolvedValue({ id: 1000, notes: 'ok' } as any);
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: 'versao antiga' }],
    } as any);

    renderHistory();

    const linha = await screen.findByLabelText(/versao antiga/);
    fireEvent(linha, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

    // A edição abriu: o campo apareceu, o que prova que a ação executou.
    expect(await screen.findByLabelText('Editar a anotação desta dose')).toBeTruthy();
  });

  it('dose sem nota nao inventa texto', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [{ ...doseCom('taken', 0), notes: null }],
    } as any);

    renderHistory();

    expect(await screen.findByLabelText(/Tomadas/)).toBeTruthy();
    expect(screen.queryByText(/nota:/i)).toBeNull();
  });

  it('9.5c: quando o histórico é maior que a página, a tela diz que é um recorte', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [doseCom('taken', 0), doseCom('taken', 1)],
      total: 312,          // o paginador do Laravel devolve isto
      current_page: 1,
      last_page: 7,
    } as any);

    renderHistory();

    // Sem isto, "adesão 100%" do histórico inteiro seria lido a partir de
    // 2 registros — o número seria verdadeiro e enganoso ao mesmo tempo.
    expect(await screen.findByText(/2 registros exibidos de 312/i)).toBeTruthy();
  });

  it('9.5c: quando cabe tudo na página, não mostra aviso de recorte', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [doseCom('taken', 0), doseCom('taken', 1)],
      total: 2,
    } as any);

    renderHistory();

    await screen.findByLabelText('Perdidas: 0');
    expect(screen.queryByText(/registros exibidos/i)).toBeNull();
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

    // `findBy` nas barras, não `getBy`: desde 2026-09-28 o gráfico tem
    // estado de carregamento real (antes `data = []` devolvia `null` e
    // o título aparecia já com as barras prontas). O título continua
    // síncrono, mas as barras só existem depois que a query resolve.
    expect(await screen.findByText('Adesão por semana')).toBeTruthy();
    expect(await screen.findByLabelText('50% de adesão nessa semana')).toBeTruthy();
    expect(await screen.findByLabelText('100% de adesão nessa semana')).toBeTruthy();
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
    mockedQueue.listPending.mockResolvedValue([]);
    mockedDoses.getConsultationSummary.mockResolvedValue({
      percentage: 90, taken: 9, due: 10, missed: [],
      period_start: '2026-08-01', period_end: '2026-08-30', all_taken: false,
      doses: [{ medication_name: 'Paracetamol', scheduled_at: '2026-08-20T08:00:00Z', taken_at: null, state: 'unrecorded' }],
    } as any);
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
          // P1/§9.2 — o gap que os `objectContaining` anteriores não
          // pegavam: o backend passou a devolver `doses` (previsto +
          // real) e o `handlePrintReport` simplesmente não repassava.
          // O relatório melhorado existia nos testes da lib e nunca
          // chegava no app. Estas três linhas são o que impede a
          // regressão de voltar em silêncio.
          doses: [
            expect.objectContaining({
              medication_name: 'Paracetamol',
              scheduled_at: '2026-08-20T08:00:00Z',
              taken_at: null,
              state: 'unrecorded',
            }),
          ],
          periodStart: '2026-08-01',
          periodEnd: '2026-08-30',
          allTaken: false,
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

  // `doses` traz `medication_name` igual ao `missed`. Mascarar só o
  // `missed` vazava o nome do remédio no relatório em modo privado.
  it('modo privado mascara o nome do remedio tambem dentro de doses', async () => {
    mockedDoses.getConsultationSummary.mockResolvedValue({
      percentage: 90, taken: 9, due: 10, missed: [],
      period_start: '2026-08-01', period_end: '2026-08-30', all_taken: false,
      doses: [{ medication_name: 'Losartana', scheduled_at: '2026-08-20T08:00:00Z', taken_at: null, state: 'unrecorded' }],
    } as any);
    usePrivacyStore.setState({ isPrivate: true });

    renderHistory();

    fireEvent.press(screen.getByLabelText('Gerar Relatório Médico (PDF)'));
    fireEvent.press(await screen.findByText('Gerar relatório'));

    await waitFor(() => {
      expect(mockedReportPdf.exportConsultationReportPdf).toHaveBeenCalled();
    });
    const payload = mockedReportPdf.exportConsultationReportPdf.mock.calls[0][0];
    expect(payload.doses[0].medication_name).not.toBe('Losartana');
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
    mockedQueue.listPending.mockResolvedValue([]);
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
    mockedDoses.getConsultationSummary.mockResolvedValue({
      percentage: 90, taken: 9, due: 10, missed: [],
      period_start: '2026-08-01', period_end: '2026-08-30', all_taken: false,
      doses: [{ medication_name: 'Paracetamol', scheduled_at: '2026-08-20T08:00:00Z', taken_at: null, state: 'unrecorded' }],
    } as any);
    renderHistory();

    fireEvent.press(await screen.findByLabelText('Compartilhar resumo pra consulta'));

    await waitFor(() => {
      expect(mockedDoses.getConsultationSummary).toHaveBeenCalled();
    });
  });
});

// Marcador de troca de fuso (2026-09-11, entrevista de decisões de
// horário — ver ROADMAP.md, item 6/20) — "misturado no feed do
// Histórico", não numa seção à parte.
describe('HistoryScreen — marcador de troca de fuso (2026-09-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana] as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    mockedQueue.listPending.mockResolvedValue([]);
  });

  it('mostra o marcador de troca de fuso junto das doses do mesmo dia', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({
      data: [logLosartana],
      timezone_changes: [
        { old_timezone: 'America/Sao_Paulo', new_timezone: 'Europe/Lisbon', changed_at: '2026-08-12T09:00:00.000Z' },
      ],
    } as any);

    renderHistory();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(
      await screen.findByText('Fuso horário mudou de America/Sao_Paulo para Europe/Lisbon'),
    ).toBeTruthy();
  });

  it('sem troca de fuso no período, não mostra marcador nenhum', async () => {
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [logLosartana], timezone_changes: [] } as any);

    renderHistory();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.queryByText(/Fuso horário mudou/)).toBeNull();
  });
});


// =============================================================
// P4/§10.4 — a dose de resgate registrada OFFLINE.
//
// O teste que motivou este bloco: sem rede, a pessoa toca em
// "Registrar dose", o app responde "dose registrada" — e ao abrir o
// Histórico a dose não estava lá. O registro estava na fila, o app já
// sabia disso, e mesmo assim a tela mostrava um histórico sem a dose que
// ele acabava de dizer que salvou. Pior do que omissão: é o produto
// contradizendo a si mesmo na mesma sessão.
// =============================================================
describe('HistoryScreen — dose de resgate pendente (P4/§10.4)', () => {
  const dipirona = {
    id: 12, profile_id: 1, name: 'Dipirona', dosage: '500', unit: 'mg', color: '#f97316',
    instructions: null, notes: null, is_active: true, is_paused: false, is_prn: true,
    schedules: [], stock: null, days_remaining: null,
  };
  // Montado em horário LOCAL de propósito. Com '2026-08-12T15:30:00Z'
  // fixo, a linha renderiza conforme o fuso da máquina: em UTC-3 o
  // `format` mostra 12:30 e o teste vira dependente de onde roda —
  // o tipo de falha que passa local e quebra no CI. Com `new Date(y, m, d,
  // h, min)` o "15:30" é 15:30 em qualquer fuso.
  const TOMADA_LOCAL = new Date(2026, 7, 12, 15, 30);
  const prnPendente = {
    client_key: 'aaaa-1111',
    medication_id: 12,
    profile_id: 1,
    taken_at: TOMADA_LOCAL.toISOString(),
    status: 'taken' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedications.mockResolvedValue([losartana, dipirona] as any);
    mockedDoses.getDoseHistory.mockResolvedValue({ data: [] } as any);
    mockedDoses.getWeeklyAdherence.mockResolvedValue([]);
    mockedDoses.getDailyAdherence.mockResolvedValue([]);
    mockedQueue.listPending.mockResolvedValue([
      { local_id: 1, type: 'log', payload: prnPendente, created_at: prnPendente.taken_at, retry_count: 0 },
    ]);
  });

  it('mostra a dose de resgate que só existe na fila, com a hora real', async () => {
    renderHistory();

    // A hora real que a pessoa registrou — 15:30, não um horário
    // agendado, que para o resgate simplesmente não existe.
    expect(await screen.findByText('15:30')).toBeTruthy();
    expect(screen.getByText('Dipirona')).toBeTruthy();
  });

  it('a dose pendente é rotulada como aguardando internet, nao como "tomado"', async () => {
    renderHistory();

    await screen.findByText('Dipirona');
    // A distinção é o ponto: o registro NÃO foi confirmado pelo servidor.
    expect(screen.getByText('aguardando internet')).toBeTruthy();
  });

  it('a dose pendente entra no dia em que foi tomada', async () => {
    renderHistory();

    // Agrupada por dia a partir do `taken_at` da fila — é o mesmo dia
    // que `dayOfDose` usará depois que sincronizar, então a linha não
    // "pula" de dia quando o servidor assumir o registro.
    await screen.findByText('Dipirona');
    expect(screen.getByText(/12 de agosto/i)).toBeTruthy();
  });

  it('a dose agendada pendente nao vira linha de resgate', async () => {
    mockedQueue.listPending.mockResolvedValue([
      {
        local_id: 1,
        type: 'log',
        payload: {
          dose_schedule_id: 1,
          medication_id: 10,
          profile_id: 1,
          scheduled_at: '2026-08-12T08:00:00.000Z',
          taken_at: '2026-08-12T08:00:00.000Z',
          status: 'taken',
        },
        created_at: '2026-08-12T08:00:00.000Z',
        retry_count: 0,
      },
    ]);

    renderHistory();

    // A dose de horário previsto continua coberta pelo
    // `applyPendingOverlay` da Home; duplicá-la aqui mostraria a mesma
    // dose duas vezes no histórico.
    await waitFor(() => expect(mockedQueue.listPending).toHaveBeenCalled());
    expect(screen.queryByText('aguardando internet')).toBeNull();
  });
});
