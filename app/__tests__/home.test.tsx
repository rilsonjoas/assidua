import React from 'react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
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
}));
// "Recalcular hoje resincroniza notificações locais" (2026-09-08) —
// index.tsx passou a chamar rescheduleTodayOccurrences; auto-mock (não
// precisa de implementação real, expo-notifications não roda no Jest).
jest.mock('../services/notifications');
jest.mock('../services/api', () => ({
  api: { get: jest.fn(), put: jest.fn(), post: jest.fn() },
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
  scheduled_at: '2026-08-08T08:00:00.000Z',
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

  it('mostra "Atrasado" e ainda permite marcar como tomada mesmo perdida', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([missedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...missedDose, status: 'taken' });

    renderHome();

    expect(await screen.findByText('Atrasado')).toBeTruthy();
    expect(screen.getByText('Tomei')).toBeTruthy();

    fireEvent.press(screen.getByText('Tomei'));

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 5, status: 'taken' }),
      );
    });
  });
});

describe('HomeScreen — streak de adesão (Fase 2, 2026-08-11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('"Foi em outro horário" abre um modal pedindo a hora, pré-preenchido com agora', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));

    expect(await screen.findByText('Que horas você tomou Losartana?')).toBeTruthy();
    // Comparado via horário local calculado (não um literal UTC fixo)
    // pra não depender do fuso de quem roda o teste — o "agora" congelado
    // é o mesmo instante, só exibido no horário local de cada máquina/CI.
    expect(screen.getByLabelText('Horário em que tomou, formato HH:MM').props.value).toBe(format(new Date(), 'HH:mm'));
  });

  it('registra a dose com o horário digitado, não "agora"', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.changeText(screen.getByLabelText('Horário em que tomou, formato HH:MM'), '10:00');
    fireEvent.press(screen.getByText('Registrar'));

    // Horário esperado calculado do mesmo jeito que o componente monta
    // (hora/minuto LOCAIS num Date do instante congelado) — evita
    // assumir um fuso específico de quem roda o teste.
    const expectedTakenAt = new Date();
    expectedTakenAt.setHours(10, 0, 0, 0);

    await waitFor(() => {
      expect(mockedDoses.logDose).toHaveBeenCalledWith(
        expect.objectContaining({ dose_schedule_id: 7, taken_at: expectedTakenAt.toISOString(), status: 'taken' }),
      );
    });
  });

  it('formato de horário inválido mostra erro e não registra nada', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.changeText(screen.getByLabelText('Horário em que tomou, formato HH:MM'), '25:99');
    fireEvent.press(screen.getByText('Registrar'));

    expect(await screen.findByText('Use o formato HH:MM, ex: 14:30')).toBeTruthy();
    expect(mockedDoses.logDose).not.toHaveBeenCalled();
  });

  it('diferença grande num remédio de intervalo oferece ajustar as próximas doses de hoje', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    // 12h de diferença do horário previsto (08:00) — bem acima do limiar de 30min.
    fireEvent.changeText(screen.getByLabelText('Horário em que tomou, formato HH:MM'), '20:00');
    fireEvent.press(screen.getByText('Registrar'));

    expect(await screen.findByText('Ajustar as próximas doses de hoje?')).toBeTruthy();
  });

  it('confirmar o ajuste chama recalculateScheduleToday com o novo horário', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });
    mockedMedications.recalculateScheduleToday.mockResolvedValueOnce({
      schedule: { ...intervalDose.dose_schedule, today_override_date: '2026-08-08', today_override_time: '20:00:00' },
      today_occurrences: ['2026-08-08T20:00:00+00:00'],
    } as any);

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.changeText(screen.getByLabelText('Horário em que tomou, formato HH:MM'), '20:00');
    fireEvent.press(screen.getByText('Registrar'));
    fireEvent.press(await screen.findByLabelText('Ajustar'));

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

  it('diferença pequena (menos de 30min) não oferece recalcular', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([intervalDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...intervalDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    // Não muda o campo — confirma com o valor pré-preenchido (mesmo
    // horário previsto, diferença zero).
    fireEvent.press(screen.getByText('Registrar'));

    await waitFor(() => expect(mockedDoses.logDose).toHaveBeenCalled());
    expect(screen.queryByText('Ajustar as próximas doses de hoje?')).toBeNull();
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
    fireEvent.changeText(screen.getByLabelText('Horário em que tomou, formato HH:MM'), '23:50');
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

  it('remédio de horário fixo não oferece recalcular, mesmo com diferença grande', async () => {
    const fixedDose = {
      ...intervalDose,
      id: 201,
      dose_schedule_id: 8,
      dose_schedule: { id: 8, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
    };
    mockedDoses.getTodayDoses.mockResolvedValue([fixedDose]);
    mockedDoses.logDose.mockResolvedValueOnce({ ...fixedDose, status: 'taken' });

    renderHome();
    fireEvent.press(await screen.findByLabelText('Registrar Losartana em outro horário'));
    fireEvent.changeText(screen.getByLabelText('Horário em que tomou, formato HH:MM'), '20:00');
    fireEvent.press(screen.getByText('Registrar'));

    await waitFor(() => expect(mockedDoses.logDose).toHaveBeenCalled());
    expect(screen.queryByText('Ajustar as próximas doses de hoje?')).toBeNull();
  });
});
