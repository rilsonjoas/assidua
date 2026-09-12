import React from 'react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../app/(tabs)/index';
import { useProfileStore } from '../store/profileStore';
import * as dosesService from '../services/doses';
import * as medicationsService from '../services/medications';
import * as notificationsService from '../services/notifications';
import { api } from '../services/api';
import * as Haptics from 'expo-haptics';

jest.mock('../services/doses');
jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  recalculateScheduleToday: jest.fn(),
  // "Pra sempre" (2026-09-11, item 12/13) — reaproveita updateSchedule
  // (mesmo endpoint de "Editar horário"); mockado explicitamente aqui
  // pelo mesmo motivo do recalculateScheduleToday acima.
  updateSchedule: jest.fn(),
}));
// "Recalcular hoje resincroniza notificações locais" (2026-09-08) —
// index.tsx passou a chamar rescheduleTodayOccurrences; auto-mock (não
// precisa de implementação real, expo-notifications não roda no Jest).
jest.mock('../services/notifications');
jest.mock('../services/api', () => ({
  api: { get: jest.fn(), put: jest.fn(), post: jest.fn() },
}));
// Troca de fuso (2026-09-11, item 1/6) — services/device NÃO era
// mockado antes (rodava de verdade, sem afetar nada porque era
// silencioso). Agora dispara toast (com haptic próprio, de propósito —
// é um evento real) sempre que `syncOwnedProfileTimezones` acha uma
// mudança; sem mockar aqui, o fixture `profile` (sem `timezone`)
// sempre "muda" em relação ao fuso REAL da máquina rodando o teste,
// disparando um toast/haptic espúrio em TODO teste deste arquivo — não
// é o que nenhum destes testes quer verificar.
jest.mock('../services/device', () => ({
  syncOwnedProfileTimezones: jest.fn(async () => []),
}));

const mockedDoses = jest.mocked(dosesService);
const mockedMedications = jest.mocked(medicationsService);
const mockedNotifications = jest.mocked(notificationsService);
const mockedApi = jest.mocked(api);

const profile = {
  id: 1,
  user_id: 1,
  name: 'Rilson',
  color: '#6366f1',
  avatar_emoji: 'account',
  is_active: true,
};

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
  stock: null,
  days_remaining: null,
  treatment_duration_days: null,
  treatment_ends_at: null,
};

const pendingDose = {
  id: 'pending_5',
  dose_schedule_id: 5,
  medication_id: 10,
  profile_id: 1,
  // "Atrasado" (2026-09-11, item 14/23) — precisa ficar DENTRO da
  // tolerância de 30min de "agora" pros testes que tocam "Tomei"
  // diretamente (sem isso, o diálogo de confirmação abriria no lugar
  // do toque direto). Calculado uma vez, no carregamento do arquivo —
  // mais simples que congelar o relógio (`jest.useFakeTimers`) em cada
  // describe que usa esta fixture, e os testes daqui não se importam
  // com o valor exato, só que seja "recente".
  scheduled_at: new Date().toISOString(),
  taken_at: null,
  status: 'pending' as const,
  notes: null,
  medication,
  dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
};

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HomeScreen />
    </QueryClientProvider>,
  );
}

describe('HomeScreen — marcar dose como tomada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  it('lista a dose pendente de hoje e marca como tomada ao tocar em "Tomei"', async () => {
    // mockResolvedValue (não `Once`) porque a mutação dispara
    // invalidateQueries no sucesso, o que causa um refetch real da
    // mesma query — precisa responder de novo, não só na primeira vez.
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...pendingDose, status: 'taken' });
    const hapticSpy = jest.spyOn(Haptics, 'notificationAsync').mockResolvedValue();

    renderHome();

    expect(await screen.findByText('Losartana')).toBeTruthy();

    fireEvent.press(screen.getByText('Tomei'));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({
          dose_schedule_id: 5,
          medication_id: 10,
          profile_id: 1,
          status: 'taken',
          // Decisão de produto do Rilson (2026-09-11): "Tomei" (toque
          // simples) grava o horário AGENDADO, não o instante do toque
          // — só "Outro horário" registra um horário diferente. Sem
          // isso, tocar às 00:01 numa dose das 00:00 aparecia como
          // "tomado às 00:01" no Histórico, confundindo o Rilson.
          taken_at: pendingDose.scheduled_at,
        }),
      );
    });

    // Achado real (2026-09-05): o toastStore passou a vibrar sozinho em
    // todo showToast — sem `{ haptic: false }` aqui (ver index.tsx), a
    // confirmação de dose online vibraria em dobro (uma vez pelo toast
    // global, outra pela lógica própria desta tela).
    await waitFor(() => {
      expect(hapticSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('mostra estado vazio quando não há perfil ativo ainda', async () => {
    useProfileStore.setState({ profiles: [], activeProfile: null });
    mockedApi.get.mockResolvedValueOnce({ data: [] });

    renderHome();

    expect(await screen.findByText('Nenhum perfil criado')).toBeTruthy();
    expect(mockedDoses.getTodayDoses).not.toHaveBeenCalled();
  });
});

describe('HomeScreen — corrigir dose (desfazer)', () => {
  const takenDose = {
    id: 99,
    dose_schedule_id: 5,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T08:00:00.000Z',
    taken_at: '2026-08-08T08:05:00.000Z',
    status: 'taken' as const,
    notes: null,
    medication,
    dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  it('desmarca uma dose "Tomado" ao tocar no badge, feito por engano', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([takenDose]);
    mockedDoses.undoDose.mockResolvedValueOnce(undefined);

    renderHome();

    expect(await screen.findByText('Tomado')).toBeTruthy();

    fireEvent.press(screen.getByText('Tomado'));

    await waitFor(() => {
      expect(mockedDoses.undoDose).toHaveBeenCalledWith(99);
    });
  });
});

describe('HomeScreen — refill alert inteligente', () => {
  const lowStockDose = {
    ...pendingDose,
    id: 'pending_5',
    medication: { ...medication, days_remaining: 3 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  it('mostra banner de estoque acabando quando days_remaining está no limiar', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([lowStockDose]);

    renderHome();

    expect(await screen.findByText(/Estoque acabando: Losartana/)).toBeTruthy();
  });

  it('não mostra banner quando o estoque está confortável', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]); // days_remaining: null no mock base

    renderHome();

    expect(await screen.findByText('Losartana')).toBeTruthy();
    expect(screen.queryByText(/Estoque acabando/)).toBeNull();
  });
});

describe('HomeScreen — status automático "Não tomado"', () => {
  const missedDose = {
    id: 42,
    dose_schedule_id: 5,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T08:00:00.000Z',
    taken_at: null,
    status: 'missed' as const,
    notes: null,
    medication,
    dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  // Renomeado (2026-09-11, item 14/15, revisado no mesmo dia — achado
  // do Rilson: "Não tomado" é mais claro pra audiência em português que
  // "Perdido") — o rótulo do status `missed` (só depois de 24h, backend)
  // agora reusa A MESMA chave que o Histórico já usava
  // (`history.filterMissed`), não mais "Atrasado" — essa palavra passou
  // a ser de um estado NOVO e diferente (30min-24h, calculado no
  // cliente), ver teste seguinte.
  it('mostra "Não tomado" e ainda permite marcar como tomada mesmo perdida', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([missedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...missedDose, status: 'taken' });

    renderHome();

    expect(await screen.findByText('Não tomado')).toBeTruthy();
    expect(screen.getByText('Tomei')).toBeTruthy();

    // Toque simples em "Tomei" numa dose já "Não tomado" continua
    // marcando direto (não decidido nesta rodada — só "Tomei numa dose
    // Atrasada" ganhou o diálogo de confirmação, ver teste seguinte).
    fireEvent.press(screen.getByText('Tomei'));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 5, status: 'taken' }),
      );
    });
  });

  // "Continua contando como não tomada?" (2026-09-11, item 2/9) — só
  // numa dose que JÁ era "Não tomado" de verdade antes de abrir "Outro
  // horário".
  it('"Outro horário" numa dose "Não tomado" pergunta antes de abrir o picker', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([missedDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));

    expect(await screen.findByText('Confirma que tomou Losartana?')).toBeTruthy();
    // Não abre o picker ainda, nem loga nada, antes de escolher.
    expect(screen.queryByText('Que horas você tomou Losartana?')).toBeNull();
    expect(mockedDoses.logDose).not.toHaveBeenCalled();
  });

  it('"Continua não tomada" fecha sem marcar nada', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([missedDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(await screen.findByLabelText('Continua não tomada'));

    await waitFor(() => {
      expect(screen.queryByText('Confirma que tomou Losartana?')).toBeNull();
    });
    expect(mockedDoses.logDose).not.toHaveBeenCalled();
  });

  it('"Marcar como tomada" abre o picker de horário normal', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([missedDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(await screen.findByLabelText('Marcar como tomada'));

    expect(await screen.findByText('Que horas você tomou Losartana?')).toBeTruthy();
  });
});

// "Atrasado" novo (2026-09-11, entrevista de decisões de horário — ver
// ROADMAP.md, item 14/25/27) — 100% calculado no cliente (30min-24h de
// atraso, dose ainda `pending` no backend). Diferente de "Não tomado"
// (`missed` de verdade, >24h) — precisa de um `describe` próprio porque
// depende de congelar o relógio numa janela bem específica em relação a
// `scheduled_at`.
describe('HomeScreen — "Atrasado" (30min-24h, calculado no cliente)', () => {
  const delayedDose = {
    id: 43,
    dose_schedule_id: 5,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T08:00:00.000Z',
    taken_at: null,
    status: 'pending' as const,
    notes: null,
    medication,
    dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  };
  // Horário LOCAL (não o literal UTC de `scheduled_at`) — mesmo motivo
  // de sempre: o teste vale igual em qualquer fuso de quem roda a suíte.
  const delayedDoseScheduledLocal = new Date(delayedDose.scheduled_at);
  const onScheduleLabel = `No horário previsto (${String(delayedDoseScheduledLocal.getHours()).padStart(2, '0')}:${String(delayedDoseScheduledLocal.getMinutes()).padStart(2, '0')})`;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 45min depois do horário previsto — dentro da janela 30min-24h.
    jest.setSystemTime(new Date('2026-08-08T08:45:00.000Z'));
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mostra "Atrasado" (não "Não tomado") pra dose ainda pending 30min+ atrasada', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([delayedDose]);

    renderHome();

    expect(await screen.findByText('Atrasado')).toBeTruthy();
    expect(screen.queryByText('Não tomado')).toBeNull();
  });

  // Revisado (2026-09-11, item 5 da rodada de transparência/UX — a
  // pedido do Rilson, "vc sugere outra UI que seja melhor que essa?").
  // O diálogo separado (Sim/Não) virou redundante com o próprio modal
  // "Outro horário", que ganhou "No horário previsto" fixado no topo —
  // mesmas 2 escolhas de antes, 1 tela a menos.
  it('"Tomei" numa dose Atrasada abre o modal "Outro horário" direto, com "No horário previsto" fixado', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([delayedDose]);

    renderHome();
    fireEvent.press(await screen.findByText('Tomei'));

    expect(await screen.findByText('Que horas você tomou Losartana?')).toBeTruthy();
    expect(screen.getByLabelText(onScheduleLabel)).toBeTruthy();
    expect(mockedDoses.logDose).not.toHaveBeenCalled();
  });

  it('"No horário previsto" grava o horário AGENDADO (mesmo comportamento de sempre)', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([delayedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...delayedDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByText('Tomei'));
    fireEvent.press(await screen.findByLabelText(onScheduleLabel));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 5, status: 'taken', taken_at: delayedDose.scheduled_at }),
      );
    });
  });

  it('os atalhos normais (Agora, Há 15 min...) continuam disponíveis pra "foi outro horário"', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([delayedDose]);

    renderHome();
    fireEvent.press(await screen.findByText('Tomei'));

    // Mesmas opções de sempre do "Outro horário", sem escolha nenhuma
    // a menos — só sem a etapa extra de confirmar que quer escolher.
    expect(screen.getByLabelText('Agora')).toBeTruthy();
    expect(screen.getByLabelText('Há 15 min')).toBeTruthy();
    expect(screen.getByLabelText('Escolher um horário específico')).toBeTruthy();
    expect(mockedDoses.logDose).not.toHaveBeenCalled();
  });
});

// "Tomei antes da hora" (2026-09-11, achado real do Rilson com o app em
// mãos, mesmo dia da entrevista de decisões de horário) — espelha o
// describe "Atrasado" acima, só que do outro lado do relógio: dose
// ainda `pending`, MUITO antes do horário previsto (mesmo limiar de
// 30min, ver `isEarly`). Antes desta correção, "Tomei" aqui gravava o
// horário AGENDADO (futuro) direto, sem abrir o modal nem oferecer
// "quer adiantar hoje/sempre?" — só o lado atrasado tinha essa oferta.
describe('HomeScreen — "Tomei" numa dose muito adiantada (30min+ antes do horário)', () => {
  const earlyDose = {
    id: 44,
    dose_schedule_id: 5,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T20:00:00.000Z',
    taken_at: null,
    status: 'pending' as const,
    notes: null,
    medication,
    dose_schedule: { id: 5, medication_id: 10, time: '20:00', days_of_week: null, interval_hours: null, is_active: true },
  };
  const earlyDoseScheduledLocal = new Date(earlyDose.scheduled_at);
  const onScheduleLabel = `No horário previsto (${String(earlyDoseScheduledLocal.getHours()).padStart(2, '0')}:${String(earlyDoseScheduledLocal.getMinutes()).padStart(2, '0')})`;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 3h ANTES do horário previsto — bem além dos 30min de limiar.
    jest.setSystemTime(new Date('2026-08-08T17:00:00.000Z'));
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('"Tomei" abre o modal "Outro horário" (não marca direto), com "No horário previsto" fixado', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([earlyDose]);

    renderHome();
    fireEvent.press(await screen.findByText('Tomei'));

    expect(await screen.findByText('Que horas você tomou Losartana?')).toBeTruthy();
    expect(screen.getByLabelText(onScheduleLabel)).toBeTruthy();
    expect(screen.getByLabelText('Agora')).toBeTruthy();
    expect(mockedDoses.logDose).not.toHaveBeenCalled();
  });

  it('escolher "Agora" oferece "Ajustar os próximos horários?" (o mesmo diálogo do lado atrasado)', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([earlyDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...earlyDose, status: 'taken', taken_at: '2026-08-08T17:00:00.000Z' });

    renderHome();
    fireEvent.press(await screen.findByText('Tomei'));
    fireEvent.press(await screen.findByLabelText('Agora'));

    expect(await screen.findByText('Ajustar os próximos horários?')).toBeTruthy();
  });

  it('"No horário previsto" ainda grava o horário AGENDADO, sem oferecer recalcular', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([earlyDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...earlyDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByText('Tomei'));
    fireEvent.press(await screen.findByLabelText(onScheduleLabel));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 5, status: 'taken', taken_at: earlyDose.scheduled_at }),
      );
    });
    expect(screen.queryByText('Ajustar os próximos horários?')).toBeNull();
  });
});

describe('HomeScreen — streak de adesão (Fase 2, 2026-08-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Defensivo (2026-09-11, achado real rodando a suíte inteira): os
    // describes "Atrasado"/"adiantada", declarados logo ANTES deste no
    // arquivo, usam `jest.useFakeTimers()`/`setSystemTime` — mesmo com
    // `afterEach` restaurando timers reais neles, rodar a suíte INTEIRA
    // (não só este arquivo isolado) deixava `Date.now()` contaminado
    // aqui às vezes, fazendo `pendingDose` (criado com `new Date()` no
    // topo do arquivo) parecer "Atrasado" por engano e abrir o modal
    // errado em vez de marcar direto. `useRealTimers()` explícito aqui
    // também, não só confiar na limpeza dos describes anteriores.
    jest.useRealTimers();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
  });

  it('mostra o badge de streak quando current_streak > 0', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([]);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 5, best_streak: 8 });

    renderHome();

    expect(await screen.findByLabelText('5 dias seguidos de adesão')).toBeTruthy();
  });

  it('não mostra o badge quando current_streak é 0', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([]);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });

    renderHome();

    await screen.findByText('Doses de hoje'); // espera a tela terminar de carregar
    expect(screen.queryByLabelText(/dias seguidos/)).toBeNull();
  });

  it('celebra quando a resposta de logDose traz streak_milestone', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 6, best_streak: 6 });
    mockedDoses.logDose.mockResolvedValueOnce({ ...pendingDose, status: 'taken', streak_milestone: 7 });

    renderHome();

    fireEvent.press(await screen.findByText('Tomei'));

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Uma semana completa')).toBeTruthy();
    expect(screen.getByText('Você não faltou nenhum dia. Continue assim.')).toBeTruthy();
  });

  it('não celebra quando logDose não traz streak_milestone', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 3, best_streak: 6 });
    mockedDoses.logDose.mockResolvedValueOnce({ ...pendingDose, status: 'taken' });

    renderHome();

    fireEvent.press(await screen.findByText('Tomei'));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalled();
    });
    expect(screen.queryByText('Uma semana completa')).toBeNull();
  });
});

// Achado real de uso, anotado no Obsidian (2026-08-14): o botão
// "Adicionar medicamento" da tela vazia levava pra lista de Remédios
// em vez de abrir o cadastro direto — um toque a mais que não precisava.
describe('HomeScreen — botão "Adicionar" abre o cadastro direto (2026-08-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedDoses.getTodayDoses.mockResolvedValue([]);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  it('sem dose nenhuma hoje, o botão "Adicionar medicamento" linka pro cadastro (/medication/new)', async () => {
    renderHome();

    await screen.findByText('Adicionar medicamento');
    expect(screen.UNSAFE_getByProps({ href: '/medication/new' })).toBeTruthy();
  });
});

// Achado real de uso (2026-09-02): "+" só existia em Remédios — pedido
// explícito de também ter em Hoje, sem obrigar trocar de aba.
describe('HomeScreen — "+" também na Home, não só em Remédios (2026-09-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
  });

  it('com dose(s) na lista, mostra o FAB "+" linkando pro cadastro', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([pendingDose]);

    renderHome();

    const fab = await screen.findByLabelText('Adicionar medicamento');
    expect(fab).toBeTruthy();
    expect(screen.UNSAFE_getByProps({ href: '/medication/new' })).toBeTruthy();
  });

  it('cuidador (perfil não-dono) não vê o FAB — não cadastra remédio', async () => {
    const collaborator = { ...profile, is_owner: false };
    useProfileStore.setState({ profiles: [collaborator], activeProfile: collaborator });
    mockedApi.get.mockResolvedValue({ data: [collaborator] });
    mockedDoses.getTodayDoses.mockResolvedValue([{ ...pendingDose, profile_id: collaborator.id }]);

    renderHome();

    await screen.findByText('Losartana');
    expect(screen.queryByLabelText('Adicionar medicamento')).toBeNull();
  });
});

// "Dose fora do horário + recálculo" (item 8, 2026-09-08) — achado real
// do Rilson: só dava pra marcar "tomei" como agora, sem jeito de
// registrar que foi em outro horário, nem de ajustar as próximas doses
// de um remédio "de X em X horas" quando isso acontece.
describe('HomeScreen — dose fora do horário (2026-09-08)', () => {
  const intervalDose = {
    id: 200,
    dose_schedule_id: 7,
    medication_id: 10,
    profile_id: 1,
    scheduled_at: '2026-08-08T08:00:00.000Z',
    taken_at: null,
    status: 'pending' as const,
    notes: null,
    medication,
    dose_schedule: { id: 7, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: 8, is_active: true },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-08T08:00:00.000Z'));
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 });
    jest.spyOn(Haptics, 'notificationAsync').mockResolvedValue();
    mockedNotifications.rescheduleTodayOccurrences.mockResolvedValue(undefined);
    // "Pra sempre" (2026-09-11, item 12/13) — mesmo motivo do
    // rescheduleTodayOccurrences acima: automock devolve `undefined`
    // cru, não uma Promise — `.catch()` em cima disso quebra sem este
    // mock explícito.
    mockedNotifications.scheduleScheduleNotifications.mockResolvedValue(undefined);
    mockedMedications.updateSchedule.mockResolvedValue({
      id: 7,
      medication_id: 10,
      time: '09:00',
      days_of_week: null,
      interval_hours: 8,
      is_active: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Campo de texto HH:MM trocado por atalhos relativos + picker nativo
  // (2026-09-11) — ver comentário em app/(tabs)/index.tsx. O mock de
  // `@react-native-community/datetimepicker` (jest.setup.ts) repassa
  // `onChange` direto pro elemento; `fireEvent(picker, 'change', event,
  // date)` simula a escolha sem precisar de um diálogo nativo de verdade.

  it('"Foi em outro horário" abre um modal com atalhos de horário, sem exigir digitar nada', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));

    expect(await screen.findByText('Que horas você tomou Losartana?')).toBeTruthy();
    expect(screen.getByLabelText('Agora')).toBeTruthy();
    expect(screen.getByLabelText('Há 15 min')).toBeTruthy();
    expect(screen.getByLabelText('Há 30 min')).toBeTruthy();
    expect(screen.getByLabelText('Há 1 hora')).toBeTruthy();
    // "No horário previsto" (2026-09-11, item 5) só aparece pra dose
    // Atrasada de verdade — esta ("agora" == `scheduled_at`, sem
    // atraso nenhum) não deveria mostrar.
    expect(screen.queryByText(/No horário previsto/)).toBeNull();
  });

  it('atalho "Agora" registra direto, sem abrir o picker', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Agora'));

    await waitFor(() => expect(mockedDoses.logDose).toHaveBeenCalled());
    const [payload] = mockedDoses.logDose.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({ dose_schedule_id: 7, status: 'taken' }));
    // Tolerância, não igualdade exata: "Agora" usa `Date.now()` no
    // instante do toque, e o `act()`/`waitFor` do RNTL pode avançar o
    // relógio congelado (`jest.useFakeTimers`) em alguns ms entre o
    // toque e esta asserção.
    expect(Math.abs(new Date((payload as any).taken_at).getTime() - Date.now())).toBeLessThan(1000);
  });

  it('"Escolher um horário específico" abre o picker nativo, pré-preenchido com agora', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));

    const pickerValue = (await screen.findByTestId('taken-at-native-picker')).props.value as Date;
    // Tolerância, não igualdade exata — mesmo motivo do teste do atalho
    // "Agora" acima (drift de alguns ms do relógio congelado via RNTL).
    expect(Math.abs(pickerValue.getTime() - Date.now())).toBeLessThan(1000);
  });

  it('registra a dose com o horário escolhido no picker (iOS/web), não "agora"', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    const picked = new Date();
    picked.setHours(10, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    // iOS/web: picker fica visível, escolher só atualiza o valor — ainda
    // precisa do toque em "Registrar" pra confirmar (jest-expo roda com
    // Platform.OS 'ios' por padrão).
    fireEvent.press(screen.getByText('Registrar'));

    // Horário esperado calculado do mesmo jeito que o componente monta
    // (hora/minuto LOCAIS do valor escolhido) — evita assumir um fuso
    // específico de quem roda o teste.
    const expectedTakenAt = new Date();
    expectedTakenAt.setHours(10, 0, 0, 0);

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 7, taken_at: expectedTakenAt.toISOString(), status: 'taken' }),
      );
    });
  });

  // Achado real do Rilson (2026-09-11): registrar "Ibuprofeno tomado às
  // 9h" via Outro horário + confirmar recalcular atualizava certinho a
  // PRÓXIMA dose (17h), mas o card da PRÓPRIA dose continuava mostrando
  // o horário agendado antigo (10h) em vez do horário registrado (9h).
  // Mesmo bug do "Bug 2" já corrigido no Histórico em 2026-09-09 — ficou
  // de fora daquela rodada por só ter mexido em history.tsx, não no
  // card da Home.
  it('depois de registrar em outro horário, o card mostra o horário REGISTRADO, não o agendado', async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const scheduledDate = new Date(intervalDose.scheduled_at);
    const scheduledLabel = `${pad(scheduledDate.getHours())}:${pad(scheduledDate.getMinutes())}`;
    // +1h (mod 24) do agendado — garante um valor diferente do agendado
    // não importa o fuso de quem roda o teste.
    const picked = new Date(scheduledDate);
    picked.setHours((scheduledDate.getHours() + 1) % 24, 0, 0, 0);
    const takenLabel = `${pad(picked.getHours())}:00`;
    // markDose invalida ['today-doses'] no onSuccess (dispara refetch) —
    // sem isso o mock devolveria pra sempre a versão "pending" original,
    // sobrescrevendo o update otimista (mesmo comportamento que a API
    // real teria, só que ela devolveria o estado atualizado de verdade).
    mockedDoses.getTodayDoses
      .mockResolvedValueOnce([intervalDose])
      .mockResolvedValue([{ ...intervalDose, status: 'taken', taken_at: picked.toISOString() }]);
    mockedDoses.logDose.mockResolvedValueOnce({
      ...intervalDose,
      status: 'taken',
      taken_at: picked.toISOString(),
    });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));

    expect(await screen.findByText(takenLabel)).toBeTruthy();
    expect(screen.queryByText(scheduledLabel)).toBeNull();
  });

  it('no Android, escolher no picker já registra direto (o diálogo nativo já tem seu próprio OK/Cancelar)', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });
    const { Platform } = require('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'android';

    try {
      renderHome();
      fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
      fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
      const picked = new Date();
      picked.setHours(10, 0, 0, 0);
      fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);

      const expectedTakenAt = new Date();
      expectedTakenAt.setHours(10, 0, 0, 0);
      await waitFor(() => {
        expect(mockedDoses.logDose).toHaveBeenCalledWith(
          expect.objectContaining({ dose_schedule_id: 7, taken_at: expectedTakenAt.toISOString(), status: 'taken' }),
        );
      });
      // Sem "Registrar" visível — o evento 'set' já confirmou sozinho.
      expect(screen.queryByText('Registrar')).toBeNull();
    } finally {
      Platform.OS = originalOS;
    }
  });

  it('diferença grande num remédio de intervalo oferece ajustar as próximas doses de hoje', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    // 12h de diferença do horário previsto (08:00) — bem acima do limiar de 30min.
    const picked = new Date();
    picked.setHours(20, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));

    expect(await screen.findByText('Ajustar os próximos horários?')).toBeTruthy();
  });

  it('confirmar "Só hoje" chama recalculateScheduleToday com o novo horário', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });
    mockedMedications.recalculateScheduleToday.mockResolvedValueOnce({
      schedule: { ...intervalDose.dose_schedule, today_override_date: '2026-08-08', today_override_time: '20:00:00' },
      today_occurrences: ['2026-08-08T20:00:00+00:00'],
    } as any);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    const picked = new Date();
    picked.setHours(20, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));
    fireEvent.press(await screen.findByLabelText('Só hoje'));

    // Instante absoluto (ISO), não mais "H:i" nu (2026-09-08, achado de
    // auditoria de fuso horário — ver ROADMAP.md). `new Date()` bate com
    // o dia de `scheduled_at` porque o "agora" congelado no beforeEach é
    // o mesmo instante.
    const expectedAnchor = new Date();
    expectedAnchor.setHours(20, 0, 0, 0);

    await waitFor(() => {
      expect(mockedMedications.recalculateScheduleToday).toHaveBeenCalledWith(7, expectedAnchor.toISOString());
    });

    // Resincroniza os lembretes locais (2026-09-08, revisitando a
    // limitação aceita) — usa exatamente os `today_occurrences` que
    // recalculateScheduleToday devolveu, não recalcula por conta própria.
    await waitFor(() => {
      expect(mockedNotifications.rescheduleTodayOccurrences).toHaveBeenCalledWith({
        scheduleId: 7,
        todayOccurrences: ['2026-08-08T20:00:00+00:00'],
        medicationName: 'Losartana',
        dosage: '50',
        unit: 'mg',
      });
    });
  });

  // "Pra sempre" (2026-09-11, item 12/13) — reaproveita updateSchedule
  // (mesmo endpoint de "Editar horário") + scheduleScheduleNotifications
  // (cancela+recria o lembrete sozinho, fecha o item 5/21 de graça).
  //
  // Bug real corrigido 2026-09-12 (Rilson, com print): "pra sempre" só
  // editava o horário permanente, sem avisar "hoje" — o log recém-criado
  // virava órfão E a ocorrência de hoje (recalculada do novo horário)
  // aparecia como uma dose pendente NOVA, idêntica em horário à que
  // acabou de ser tomada. Agora "pra sempre" também chama
  // recalculateScheduleToday (mesmo mecanismo de "só hoje", que pula a
  // própria âncora de propósito) — o teste antigo aqui chegou a travar o
  // bug como comportamento esperado ("não chama recalculateScheduleToday
  // — são exclusivos"), corrigido junto.
  it('confirmar "Sempre, a partir de agora" chama updateSchedule E recalculateScheduleToday (evita duplicar a dose de hoje)', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });
    mockedMedications.updateSchedule.mockResolvedValueOnce({
      ...intervalDose.dose_schedule,
      time: '20:00',
    } as any);
    mockedMedications.recalculateScheduleToday.mockResolvedValueOnce({
      schedule: { ...intervalDose.dose_schedule, time: '20:00', today_override_date: '2026-08-08', today_override_time: '20:00:00' },
      today_occurrences: ['2026-08-09T04:00:00+00:00'],
    } as any);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    const picked = new Date();
    picked.setHours(20, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));
    fireEvent.press(await screen.findByLabelText('Sempre, a partir de agora'));

    const expectedAnchor = new Date();
    expectedAnchor.setHours(20, 0, 0, 0);

    await waitFor(() => {
      expect(mockedMedications.updateSchedule).toHaveBeenCalledWith(7, { time: '20:00' });
    });
    await waitFor(() => {
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 7, time: '20:00', medicationName: 'Losartana' }),
      );
    });
    // A correção: também roda o mecanismo de "hoje" (pula a própria
    // âncora), pra não duplicar a dose que acabou de ser registrada.
    await waitFor(() => {
      expect(mockedMedications.recalculateScheduleToday).toHaveBeenCalledWith(7, expectedAnchor.toISOString());
    });
    await waitFor(() => {
      expect(mockedNotifications.rescheduleTodayOccurrences).toHaveBeenCalledWith({
        scheduleId: 7,
        todayOccurrences: ['2026-08-09T04:00:00+00:00'],
        medicationName: 'Losartana',
        dosage: '50',
        unit: 'mg',
      });
    });
  });

  it('diferença pequena (menos de 30min) não oferece recalcular', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    // Atalho "Agora" — mesmo instante do horário previsto (o "agora"
    // congelado no beforeEach É `intervalDose.scheduled_at`), diferença zero.
    fireEvent.press(screen.getByLabelText('Agora'));

    await waitFor(() => expect(mockedDoses.logDose).toHaveBeenCalled());
    expect(screen.queryByText('Ajustar os próximos horários?')).toBeNull();
  });

  // Achado real de revisão de código (2026-09-08): o horário digitado
  // era montado em cima de "hoje", não do dia da dose prevista — uma
  // dose de antes da meia-noite, só registrada depois dela, virava 24h+
  // no futuro em vez do horário real de ontem à noite.
  it('registrar horário de antes da meia-noite não vira o dia seguinte', async () => {
    // Construído via componentes LOCAIS (`new Date(y, m, d, h, min)`),
    // não strings ISO/UTC fixas — o teste vale igual em qualquer fuso
    // de quem roda a suíte, sem assumir um específico.
    const now = new Date(2026, 7, 9, 0, 10, 0, 0); // 9/ago, 00:10 local — pouco após a meia-noite
    const scheduledAt = new Date(now.getTime() - 20 * 60000); // 8/ago, 23:50 local — ainda não registrada
    jest.setSystemTime(now);

    const lateNightDose = {
      ...intervalDose,
      id: 202,
      dose_schedule_id: 9,
      scheduled_at: scheduledAt.toISOString(),
      dose_schedule: { id: 9, medication_id: 10, time: '23:50', days_of_week: null, interval_hours: 8, is_active: true },
    };
    mockedDoses.getTodayDoses.mockResolvedValue([lateNightDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...lateNightDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    // O picker nativo (mode="time") devolve hora/minuto ancorados no dia
    // de HOJE (9/ago) — exatamente o cenário que expôs o bug original.
    const picked = new Date(now);
    picked.setHours(23, 50, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));

    // Corrigido (2026-09-08): base no dia do `scheduled_at` (ontem à
    // noite), não em "hoje" — a pessoa digitou o horário certo, o
    // resultado deve ser exatamente o próprio `scheduled_at`.
    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ taken_at: scheduledAt.toISOString() }),
      );
    });

    // Prova de que o bug antigo (base = "hoje") não voltou: "hoje
    // 23:50" seria quase 24h depois do horário correto.
    const wrongDayIfBugged = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 50, 0, 0);
    expect(mockedDoses.logDose).not.toHaveBeenCalledWith(
      expect.objectContaining({ taken_at: wrongDayIfBugged.toISOString() }),
    );
  });

  // Revisa o teste original (2026-09-11, item 3/19 — entrevista de
  // decisões de horário): antes horário fixo NUNCA oferecia recalcular
  // (só intervalo tinha "próxima dose" pra deslocar). Agora oferece
  // igual, mas o "ajuste" possível é diferente — ver os 2 testes abaixo.
  const fixedDose = {
    ...intervalDose,
    id: 201,
    dose_schedule_id: 8,
    dose_schedule: { id: 8, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
  };

  it('remédio de horário fixo TAMBÉM oferece ajustar, com diferença grande', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([fixedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...fixedDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    const picked = new Date();
    picked.setHours(20, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));

    expect(await screen.findByText('Ajustar os próximos horários?')).toBeTruthy();
  });

  // Horário fixo só gera 1 ocorrência/dia — "Só hoje" não tem NADA a
  // deslocar (a dose já foi registrada com o horário certo), então não
  // chama o backend de recálculo, só confirma pra pessoa que terminou.
  it('horário fixo + "Só hoje" não chama recalculateScheduleToday (nada a deslocar no mesmo dia)', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([fixedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...fixedDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    const picked = new Date();
    picked.setHours(20, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));
    fireEvent.press(await screen.findByLabelText('Só hoje'));

    await waitFor(() => expect(screen.queryByText('Ajustar os próximos horários?')).toBeNull());
    expect(mockedMedications.recalculateScheduleToday).not.toHaveBeenCalled();
    expect(mockedMedications.updateSchedule).not.toHaveBeenCalled();
  });

  // "Sempre" pra horário fixo é o ajuste que faz sentido: muda o `time`
  // permanente do schedule (mesmo caminho de "Editar horário").
  it('horário fixo + "Sempre, a partir de agora" chama updateSchedule', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([fixedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...fixedDose, status: 'taken' });
    mockedMedications.updateSchedule.mockResolvedValueOnce({ ...fixedDose.dose_schedule, time: '20:00' } as any);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.press(screen.getByLabelText('Escolher um horário específico'));
    const picked = new Date();
    picked.setHours(20, 0, 0, 0);
    fireEvent(await screen.findByTestId('taken-at-native-picker'), 'change', { type: 'set' }, picked);
    fireEvent.press(screen.getByText('Registrar'));
    fireEvent.press(await screen.findByLabelText('Sempre, a partir de agora'));

    await waitFor(() => {
      expect(mockedMedications.updateSchedule).toHaveBeenCalledWith(8, { time: '20:00' });
    });
    // Horário fixo não tem endpoint de recálculo "só hoje" (backend
    // rejeita) — editar o permanente é tudo que "pra sempre" faz aqui.
    expect(mockedMedications.recalculateScheduleToday).not.toHaveBeenCalled();
  });
});
