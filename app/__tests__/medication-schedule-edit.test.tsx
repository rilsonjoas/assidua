import React from 'react';
import { Alert } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import MedicationFormScreen from '../app/medication/[id]';
import { useProfileStore } from '../store/profileStore';
import * as medicationsService from '../services/medications';
import * as notificationsService from '../services/notifications';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedication: jest.fn(),
  createMedication: jest.fn(),
  updateMedication: jest.fn(),
  updateSchedule: jest.fn(),
  createSchedule: jest.fn(),
  deleteSchedule: jest.fn(),
  uploadMedicationPhoto: jest.fn(),
  deleteMedicationPhoto: jest.fn(),
  updateStock: jest.fn(),
  deleteMedication: jest.fn(),
}));
jest.mock('../services/notifications');
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockedMedications = jest.mocked(medicationsService);
const mockedNotifications = jest.mocked(notificationsService);
const mockedImagePicker = jest.mocked(ImagePicker);
const mockedSearchParams = useLocalSearchParams as jest.Mock;

const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

const schedule = {
  id: 20,
  medication_id: 10,
  time: '08:00:00',
  days_of_week: [1, 3, 5],
  interval_hours: null,
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
  schedules: [schedule],
  stock: null,
  days_remaining: null,
  treatment_duration_days: null,
  treatment_ends_at: null,
};

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationFormScreen />
    </QueryClientProvider>,
  );
}

describe('MedicationFormScreen — editar horário existente (Fase 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
  });

  it('abre o formulário pré-preenchido com hora e dias do horário existente', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar horário das 08:00:00, Seg, Qua, Sex'));

    expect(screen.getByText('Editar horário')).toBeTruthy();
    expect(screen.getByPlaceholderText('08:00').props.value).toBe('08:00');
    expect(screen.getByText('Salvar')).toBeTruthy();
  });

  // "Horário salva sozinho" (2026-09-07, item 12) — reforço visual pra
  // deixar explícito que essa seção não depende do "Salvar alterações".
  it('mostra o aviso de que horário salva sozinho ao editar um remédio existente', async () => {
    renderScreen();

    expect(await screen.findByText(/não precisa do botão Salvar/)).toBeTruthy();
  });

  it('salva a edição chamando updateSchedule (não createSchedule) e reagenda a notificação', async () => {
    const updated = { ...schedule, time: '09:30:00' };
    mockedMedications.updateSchedule.mockResolvedValueOnce(updated as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar horário das 08:00:00, Seg, Qua, Sex'));
    fireEvent.changeText(screen.getByPlaceholderText('08:00'), '09:30');
    fireEvent.press(screen.getByText('Salvar'));

    await waitFor(() => {
      expect(mockedMedications.updateSchedule).toHaveBeenCalledWith(20, {
        time: '09:30',
        days_of_week: [1, 3, 5],
        // "Frequência de horário" (2026-08-14) — payload sempre inclui
        // interval_hours agora (null no modo fixo).
        interval_hours: null,
      });
      expect(mockedMedications.createSchedule).not.toHaveBeenCalled();
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 20, time: '09:30', days_of_week: [1, 3, 5], interval_hours: null }),
      );
    });

    // volta pro estado de lista, sem o form aberto
    expect(screen.queryByText('Editar horário')).toBeNull();
  });

  it('cancelar a edição não chama updateSchedule', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar horário das 08:00:00, Seg, Qua, Sex'));
    fireEvent.press(screen.getByText('Cancelar'));

    expect(mockedMedications.updateSchedule).not.toHaveBeenCalled();
    expect(screen.queryByText('Editar horário')).toBeNull();
  });
});

// "Frequência de horário" (2026-08-14) — decisão de produto confirmada
// com o Rilson: vale o esforço de um intervalo de verdade em vez de só
// sugerir cadastrar N horários fixos manualmente.
describe('MedicationFormScreen — frequência de horário: fixo vs intervalo (2026-08-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
  });

  it('modo começa em "Horário fixo" por padrão ao adicionar novo horário', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Adicionar horário'));

    const fixedBtn = screen.getByLabelText('Horário fixo');
    expect(fixedBtn.props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('Dias da semana')).toBeTruthy();
    expect(screen.queryByText('De quantas em quantas horas')).toBeNull();
  });

  // A partir de 2026-09-07 o modo (fixo/intervalo) é escolhido nos
  // cards do topo da seção Horários, não mais num toggle escondido
  // dentro do formulário de cada horário — ver `scheduleKind`. Sem
  // horário nenhum cadastrado ainda, não há nada a perder: a troca é
  // direta, sem confirmação (o caso com horário existente tem sua
  // própria suíte logo abaixo).
  it('sem horário cadastrado, trocar pra "A cada X horas" troca direto e o formulário passa a mostrar o campo de intervalo', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, schedules: [] } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));
    expect(mockedMedications.deleteSchedule).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Adicionar horário'));

    expect(screen.getByText('De quantas em quantas horas')).toBeTruthy();
    expect(screen.queryByText('Dias da semana')).toBeNull();
  });

  it('salvar em modo intervalo envia interval_hours e days_of_week null', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, schedules: [] } as any);
    const created = { id: 99, medication_id: 10, time: '07:00:00', days_of_week: null, interval_hours: 8, is_active: true };
    mockedMedications.createSchedule.mockResolvedValueOnce(created as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));
    fireEvent.press(screen.getByLabelText('Adicionar horário'));
    fireEvent.changeText(screen.getByPlaceholderText('08:00'), '07:00');
    fireEvent.changeText(screen.getByLabelText('Intervalo em horas entre as doses'), '8');
    fireEvent.press(screen.getByText('Adicionar'));

    await waitFor(() => {
      expect(mockedMedications.createSchedule).toHaveBeenCalledWith(10, {
        time: '07:00',
        days_of_week: null,
        interval_hours: 8,
      });
      // Achado real de uso (2026-08-14), corrigido no mesmo dia: sem isto o
      // lembrete local ficava só 1x/dia no horário-âncora, mesmo o
      // medicamento tendo várias doses diárias no modo intervalo.
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 99, time: '07:00', days_of_week: null, interval_hours: 8 }),
      );
    });
  });

  it('intervalo fora de 1-168 mostra erro e não salva', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, schedules: [] } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));
    fireEvent.press(screen.getByLabelText('Adicionar horário'));
    fireEvent.changeText(screen.getByLabelText('Intervalo em horas entre as doses'), '200');
    fireEvent.press(screen.getByText('Adicionar'));

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Informe um intervalo entre 1 e 168 horas.')).toBeTruthy();
    expect(mockedMedications.createSchedule).not.toHaveBeenCalled();
  });

  it('editar horário existente de intervalo abre já no modo "A cada X horas", com o valor certo', async () => {
    mockedMedications.getMedication.mockResolvedValue({
      ...medication,
      schedules: [{ id: 21, medication_id: 10, time: '06:00:00', days_of_week: null, interval_hours: 12, is_active: true }],
    } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar horário das 06:00:00, A cada 12 horas'));

    const intervalBtn = screen.getByLabelText('A cada X horas');
    expect(intervalBtn.props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Intervalo em horas entre as doses').props.value).toBe('12');
  });

  it('lista de horários mostra "A cada N horas" em vez dos dias da semana pra schedule de intervalo', async () => {
    mockedMedications.getMedication.mockResolvedValue({
      ...medication,
      schedules: [{ id: 21, medication_id: 10, time: '06:00:00', days_of_week: null, interval_hours: 12, is_active: true }],
    } as any);

    renderScreen();

    expect(await screen.findByText('A cada 12 horas')).toBeTruthy();
  });
});

// Trocar de modo (fixo ↔ intervalo) num remédio que JÁ TEM horário
// cadastrado apaga e recria de verdade no backend — destrutivo, por
// isso passa por confirmação (2026-09-07). O caso sem horário nenhum já
// está coberto na suíte acima (troca direta, sem perguntar).
describe('MedicationFormScreen — trocar de modo com horário já cadastrado pede confirmação (2026-09-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
  });

  it('tocar em "A cada X horas" com horário fixo já cadastrado abre confirmação sem mexer em nada ainda', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));

    expect(screen.getByText('Trocar o tipo de horário?')).toBeTruthy();
    expect(mockedMedications.deleteSchedule).not.toHaveBeenCalled();
    expect(mockedMedications.createSchedule).not.toHaveBeenCalled();
  });

  it('cancelar a troca mantém o horário fixo original intacto', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));
    fireEvent.press(screen.getByLabelText('Cancelar'));

    expect(mockedMedications.deleteSchedule).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Horário fixo').props.accessibilityState.selected).toBe(true);
  });

  it('confirmar a troca apaga o horário fixo atual e cria um novo já em modo intervalo', async () => {
    mockedMedications.deleteSchedule.mockResolvedValueOnce(undefined);
    const created = { id: 99, medication_id: 10, time: '08:00:00', days_of_week: null, interval_hours: 8, is_active: true };
    mockedMedications.createSchedule.mockResolvedValueOnce(created as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));
    fireEvent.press(screen.getByLabelText('Confirmar'));

    await waitFor(() => {
      expect(mockedMedications.deleteSchedule).toHaveBeenCalledWith(20);
      expect(mockedNotifications.cancelScheduleNotifications).toHaveBeenCalledWith(20);
      // Âncora reaproveita o horário do schedule antigo (08:00) — menos
      // surpresa do que forçar sempre um horário fixo diferente.
      expect(mockedMedications.createSchedule).toHaveBeenCalledWith(10, {
        time: '08:00',
        days_of_week: null,
        interval_hours: 8,
      });
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 99, time: '08:00', days_of_week: null, interval_hours: 8 }),
      );
    });
    expect(screen.getByLabelText('A cada X horas').props.accessibilityState.selected).toBe(true);
  });

  // Achado real de revisão de código (2026-09-08): o Promise.all que
  // apaga os horários antigos não é atômico — se uma chamada falhar no
  // meio (rede instável), as anteriores já apagaram de verdade no
  // backend, mas a tela continuava mostrando a lista antiga até
  // recarregar manualmente.
  it('se apagar o horário antigo falhar no meio da troca, resincroniza com o backend em vez de mostrar estado desatualizado', async () => {
    // Flag mutável em vez de encadear `mockResolvedValueOnce` (acabou
    // sendo frágil: o mount inicial pode chamar `getMedication` mais de
    // uma vez dependendo do ambiente de teste, consumindo a fila fora
    // de ordem). Modela a realidade: o horário só "some" do backend
    // DEPOIS da tentativa de apagar, não importa quantas vezes
    // `getMedication` seja chamado antes disso.
    let scheduleDeletedServerSide = false;
    mockedMedications.getMedication.mockImplementation(async () =>
      scheduleDeletedServerSide ? ({ ...medication, schedules: [] } as any) : (medication as any),
    );
    mockedMedications.deleteSchedule.mockImplementationOnce(async () => {
      scheduleDeletedServerSide = true;
      throw new Error('falha de rede');
    });

    renderScreen();

    fireEvent.press(await screen.findByLabelText('A cada X horas'));
    fireEvent.press(screen.getByLabelText('Confirmar'));

    // `waitFor` sozinho não bastou aqui — a cadeia de `await`s dentro do
    // catch (retry via `getMedication`) resolve por microtask, mas sob
    // carga (suíte inteira, muitos workers) o polling do `waitFor` pode
    // não pegar isso a tempo do timeout padrão (confirmado: passa
    // isolado, falhava rodando junto com as outras 41 suítes). Yield
    // explícito + timeout maior dão margem de sobra sem prender a
    // suíte por muito tempo no caso comum (que resolve bem mais rápido).
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => {
      expect(screen.queryByLabelText('Editar horário das 08:00:00, Seg, Qua, Sex')).toBeNull();
    }, { timeout: 3000 });
    // Volta pra "Horário fixo" (sem horário nenhum, é o padrão) — não
    // fica preso mostrando "A cada X horas" selecionado sem ter
    // conseguido trocar de verdade.
    expect(screen.getByLabelText('Horário fixo').props.accessibilityState.selected).toBe(true);
    expect(mockedMedications.createSchedule).not.toHaveBeenCalled();
  });
});

describe('MedicationFormScreen — pausar/reativar medicamento (Fase 2, 2026-08-12)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
  });

  it('pausar chama updateMedication e cancela a notificação de cada horário', async () => {
    mockedMedications.updateMedication.mockResolvedValueOnce({ ...medication, is_paused: true } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Pausar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.updateMedication).toHaveBeenCalledWith(10, { is_paused: true });
      expect(mockedNotifications.cancelScheduleNotifications).toHaveBeenCalledWith(20);
      expect(mockedNotifications.scheduleScheduleNotifications).not.toHaveBeenCalled();
    });

    expect(await screen.findByLabelText('Reativar medicamento')).toBeTruthy();
  });

  it('reativar chama updateMedication e reagenda a notificação de cada horário', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, is_paused: true } as any);
    mockedMedications.updateMedication.mockResolvedValueOnce({ ...medication, is_paused: false } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Reativar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.updateMedication).toHaveBeenCalledWith(10, { is_paused: false });
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 20, time: '08:00', days_of_week: [1, 3, 5], interval_hours: null }),
      );
    });
  });

  // Achado real de uso (2026-08-14), corrigido no mesmo dia: reativar um
  // medicamento com schedule de intervalo perdia o interval_hours no
  // reagendamento, voltando o lembrete local pra 1x/dia.
  it('reativar medicamento com schedule de intervalo reagenda com interval_hours', async () => {
    const intervalSchedule = { ...schedule, id: 21, days_of_week: null, interval_hours: 8 };
    mockedMedications.getMedication.mockResolvedValue({
      ...medication,
      schedules: [intervalSchedule],
      is_paused: true,
    } as any);
    mockedMedications.updateMedication.mockResolvedValueOnce({ ...medication, is_paused: false } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Reativar medicamento'));

    await waitFor(() => {
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: 21, time: '08:00', days_of_week: null, interval_hours: 8 }),
      );
    });
  });

  it('mostra aviso de pausado quando o medicamento já está pausado', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, is_paused: true } as any);

    renderScreen();

    expect(await screen.findByText(/não vai gerar dose nem lembrete/)).toBeTruthy();
  });
});

// Achado real testando no dispositivo (2026-08-13): "Remover horário"
// usava Alert.alert nativo, destoando do resto do app. Virou
// ConfirmDialog temático (ver components/ConfirmDialog.tsx).
describe('MedicationFormScreen — confirmação de remover horário (2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
  });

  it('tocar em remover abre o diálogo sem apagar antes de confirmar', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Remover horário das 08:00:00, Seg, Qua, Sex'));

    expect(screen.getByText('Remover o horário das 08:00:00?')).toBeTruthy();
    expect(mockedMedications.deleteSchedule).not.toHaveBeenCalled();
  });

  it('confirmar remove de verdade e cancela a notificação', async () => {
    mockedMedications.deleteSchedule.mockResolvedValueOnce(undefined);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Remover horário das 08:00:00, Seg, Qua, Sex'));
    fireEvent.press(screen.getByLabelText('Remover'));

    await waitFor(() => {
      expect(mockedMedications.deleteSchedule).toHaveBeenCalledWith(20);
      expect(mockedNotifications.cancelScheduleNotifications).toHaveBeenCalledWith(20);
    });
    expect(screen.queryByText('Remover o horário das 08:00:00?')).toBeNull();
  });

  it('cancelar não remove nada', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Remover horário das 08:00:00, Seg, Qua, Sex'));
    fireEvent.press(screen.getByLabelText('Cancelar'));

    expect(mockedMedications.deleteSchedule).not.toHaveBeenCalled();
    expect(screen.queryByText('Remover o horário das 08:00:00?')).toBeNull();
  });
});

// Achado real (2026-08-13): campo "notes" já existia no backend
// (coluna + validação), mas nunca tinha chegado no formulário mobile —
// ninguém testava esse caminho porque ele nunca existiu de verdade.
describe('MedicationFormScreen — campo de observações (2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  });

  it('carrega observações existentes no formulário', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, notes: 'Comprar genérico da próxima vez' } as any);

    renderScreen();

    expect(await screen.findByDisplayValue('Comprar genérico da próxima vez')).toBeTruthy();
  });

  it('salvar envia as observações editadas junto com o resto', async () => {
    mockedMedications.getMedication.mockResolvedValue(medication as any);
    mockedMedications.updateMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Observações'), 'Trocar de marca se enjoar');
    fireEvent.press(screen.getByText('Salvar alterações'));

    await waitFor(() => {
      expect(mockedMedications.updateMedication).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ notes: 'Trocar de marca se enjoar' }),
      );
    });
  });
});

// Achado real de uso, anotado no Obsidian (2026-08-14): dosagem
// obrigatória era fricção sem ganho — nem todo remédio tem uma
// numérica relevante (pomada, "conforme orientação médica").
describe('MedicationFormScreen — criar medicamento sem dosagem (2026-08-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('salvar sem preencher dosagem cria o medicamento com dosage null', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce({ ...medication, dosage: null } as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Pomada para assadura');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ dosage: null }),
      );
    });
  });

  it('salvar sem preencher o nome mostra erro e não chama createMedication', async () => {
    renderScreen();

    fireEvent.press(await screen.findByText('Cadastrar medicamento'));

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Preencha o nome do remédio.')).toBeTruthy();
    expect(mockedMedications.createMedication).not.toHaveBeenCalled();
  });

  // Achado real de uso (2026-08-14): "mg" vinha pré-preenchido na
  // unidade mesmo sem nenhuma dosagem — não fazia sentido depois de
  // dosagem virar opcional. Campo começa vazio; sem preencher, `unit`
  // não vai no payload, o backend já tem default sensato pra isso.
  it('unidade começa vazia, e sem preencher não vai no payload', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    expect(screen.getByLabelText('Unidade da dosagem').props.value).toBe('');

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Pomada para assadura');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ unit: undefined }),
      );
    });
  });
});

// Achado real de uso, anotado no Obsidian (2026-08-14): não tinha onde
// registrar estoque ao cadastrar — reaproveita `updateStock`, sem rota
// nova.
describe('MedicationFormScreen — estoque no cadastro (2026-08-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('preencher estoque inicial chama updateStock depois de criar o medicamento', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.changeText(screen.getByLabelText('Quantidade em estoque'), '30');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.updateStock).toHaveBeenCalledWith(10, { current_quantity: 30 });
    });
  });

  it('sem preencher estoque, não chama updateStock — fica no default do backend', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalled();
    });
    expect(mockedMedications.updateStock).not.toHaveBeenCalled();
  });

  it('editar medicamento existente não mostra o campo de estoque inicial', async () => {
    mockedSearchParams.mockReturnValue({ id: '10' });
    mockedMedications.getMedication.mockResolvedValue(medication as any);

    renderScreen();

    await screen.findByText('Salvar alterações');
    expect(screen.queryByLabelText('Quantidade em estoque')).toBeNull();
  });
});

// "Estoque editável na tela do remédio" (2026-09-07, item 13) — achado
// real do Rilson: dava pra ajustar o estoque pela aba Estoque, mas não
// editando o remédio diretamente. Mesmo par Adicionar/Definir de
// app/(tabs)/stock.tsx, reaproveitando `updateStock`.
describe('MedicationFormScreen — estoque editável na edição (2026-09-07)', () => {
  const stockItem = {
    id: 5, medication_id: 10, current_quantity: 20, unit: 'comprimidos', min_alert_quantity: 5, last_updated_at: '2026-09-01T10:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('cadastro (isNew) não mostra o bloco de estoque editável — só o de estoque inicial', async () => {
    mockedSearchParams.mockReturnValue({ id: 'new' });

    renderScreen();

    await screen.findByText('Cadastrar medicamento');
    expect(screen.queryByText('Estoque')).toBeNull();
  });

  it('mostra a quantidade atual e um botão de editar, sem precisar ir na aba Estoque', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, stock: stockItem } as any);

    renderScreen();

    expect(await screen.findByText('20 comprimidos')).toBeTruthy();
    expect(screen.getByLabelText('Editar estoque de Losartana')).toBeTruthy();
  });

  it('estoque nunca definido mostra a dica em vez de "0 unid"', async () => {
    mockedMedications.getMedication.mockResolvedValue({
      ...medication,
      stock: { ...stockItem, current_quantity: 0, last_updated_at: null },
    } as any);

    renderScreen();

    expect(await screen.findByText('Estoque não informado — toque em Editar')).toBeTruthy();
  });

  it('"Adicionar" soma ao estoque atual e reagenda o alerta de estoque baixo', async () => {
    mockedMedications.getMedication.mockResolvedValueOnce({ ...medication, stock: stockItem } as any);
    mockedMedications.updateStock.mockResolvedValueOnce({ ...stockItem, current_quantity: 30 } as any);
    mockedMedications.getMedication.mockResolvedValueOnce({ ...medication, stock: { ...stockItem, current_quantity: 30 }, days_remaining: 10 } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar estoque de Losartana'));
    fireEvent.changeText(screen.getByLabelText('Quantidade em estoque de Losartana'), '10');
    fireEvent.press(screen.getByLabelText('Adicionar ao estoque de Losartana'));

    await waitFor(() => {
      expect(mockedMedications.updateStock).toHaveBeenCalledWith(10, { current_quantity: 30 });
      expect(mockedNotifications.scheduleRefillAlert).toHaveBeenCalledWith(
        expect.objectContaining({ medicationId: 10, daysRemaining: 10 }),
      );
    });
    expect(await screen.findByText('30 comprimidos')).toBeTruthy();
  });

  it('"Definir" substitui o valor exato, não soma', async () => {
    mockedMedications.getMedication.mockResolvedValueOnce({ ...medication, stock: stockItem } as any);
    mockedMedications.updateStock.mockResolvedValueOnce({ ...stockItem, current_quantity: 5 } as any);
    mockedMedications.getMedication.mockResolvedValueOnce({ ...medication, stock: { ...stockItem, current_quantity: 5 }, days_remaining: 2 } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar estoque de Losartana'));
    fireEvent.changeText(screen.getByLabelText('Quantidade em estoque de Losartana'), '5');
    fireEvent.press(screen.getByLabelText('Definir estoque de Losartana'));

    await waitFor(() => {
      expect(mockedMedications.updateStock).toHaveBeenCalledWith(10, { current_quantity: 5 });
    });
  });

  it('valor inválido mostra erro e não chama updateStock', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, stock: stockItem } as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar estoque de Losartana'));
    fireEvent.changeText(screen.getByLabelText('Quantidade em estoque de Losartana'), '-5');
    fireEvent.press(screen.getByLabelText('Definir estoque de Losartana'));

    expect(await screen.findByText('Valor inválido')).toBeTruthy();
    expect(mockedMedications.updateStock).not.toHaveBeenCalled();
  });
});

// "Excluir medicamento" (2026-09-07, item 15) — achado real do Rilson:
// o serviço (`deleteMedication`) e a rota do backend já existiam, sem
// nenhum botão na UI pra chegar até eles.
describe('MedicationFormScreen — excluir medicamento (2026-09-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('cadastro (isNew) não mostra o botão de excluir — remédio ainda não existe', async () => {
    mockedSearchParams.mockReturnValue({ id: 'new' });

    renderScreen();

    await screen.findByText('Cadastrar medicamento');
    expect(screen.queryByLabelText('Excluir medicamento')).toBeNull();
  });

  it('cuidador (perfil sem is_owner) não vê o botão de excluir', async () => {
    const caregiverProfile = { ...profile, is_owner: false };
    useProfileStore.setState({ profiles: [caregiverProfile], activeProfile: caregiverProfile });

    renderScreen();

    await screen.findByText('Modo Cuidador — Visualização do cadastro (edição restrita ao proprietário).');
    expect(screen.queryByLabelText('Excluir medicamento')).toBeNull();
  });

  it('tocar em excluir abre a confirmação sem apagar nada ainda', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Excluir medicamento'));

    expect(screen.getByText('Excluir medicamento?')).toBeTruthy();
    expect(screen.getByText(/Losartana.*histórico de doses e adesão/)).toBeTruthy();
    expect(mockedMedications.deleteMedication).not.toHaveBeenCalled();
  });

  it('cancelar não exclui nada', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Excluir medicamento'));
    fireEvent.press(screen.getByLabelText('Cancelar'));

    expect(mockedMedications.deleteMedication).not.toHaveBeenCalled();
    expect(screen.queryByText('Excluir medicamento?')).toBeNull();
  });

  it('confirmar exclui de verdade, cancela as notificações dos horários e volta', async () => {
    mockedMedications.deleteMedication.mockResolvedValueOnce(undefined);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Excluir medicamento'));
    // Dois "Excluir medicamento" na tela nesse momento: o botão que abriu
    // o diálogo e o botão de confirmar dentro dele — pega o do diálogo.
    const confirmButtons = screen.getAllByLabelText('Excluir medicamento');
    fireEvent.press(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockedMedications.deleteMedication).toHaveBeenCalledWith(10);
      expect(mockedNotifications.cancelScheduleNotifications).toHaveBeenCalledWith(20);
    });
  });
});

// Achado real de uso, anotado no Obsidian (2026-08-14): muitos remédios
// têm limite de dias pra tomar. Decisão de produto confirmada: quando
// os dias acabarem, só avisa (push, comando agendado no backend) —
// nunca pausa sozinho.
describe('MedicationFormScreen — duração do tratamento (2026-08-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('preencher duração envia treatment_duration_days ao criar', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Amoxicilina');
    fireEvent.changeText(screen.getByLabelText('Duração do tratamento em dias'), '10');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ treatment_duration_days: 10 }),
      );
    });
  });

  it('sem preencher duração, envia treatment_duration_days null — uso contínuo', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ treatment_duration_days: null }),
      );
    });
  });

  it('duração inválida (0) mostra erro e não salva', async () => {
    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Amoxicilina');
    fireEvent.changeText(screen.getByLabelText('Duração do tratamento em dias'), '0');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Informe um número de dias válido, maior que zero.')).toBeTruthy();
    expect(mockedMedications.createMedication).not.toHaveBeenCalled();
  });

  it('editar medicamento existente carrega a duração já cadastrada', async () => {
    mockedSearchParams.mockReturnValue({ id: '10' });
    mockedMedications.getMedication.mockResolvedValue({ ...medication, treatment_duration_days: 14 } as any);

    renderScreen();

    expect((await screen.findByLabelText('Duração do tratamento em dias')).props.value).toBe('14');
  });

  it('editar e limpar a duração envia null (volta a ser uso contínuo)', async () => {
    mockedSearchParams.mockReturnValue({ id: '10' });
    mockedMedications.getMedication.mockResolvedValue({ ...medication, treatment_duration_days: 14 } as any);
    mockedMedications.updateMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    const field = await screen.findByLabelText('Duração do tratamento em dias');
    fireEvent.changeText(field, '');
    fireEvent.press(screen.getByText('Salvar alterações'));

    await waitFor(() => {
      expect(mockedMedications.updateMedication).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ treatment_duration_days: null }),
      );
    });
  });
});

// Feedback do Rilson (2026-08-21): "quantas vezes tomar não está bem
// configurável" — o cadastro só aceitava UM horário; o resto exigia
// criar, reabrir e editar. Agora a criação tem lista de rascunhos com
// atalhos de frequência, presets de dias/intervalo e duração com data
// de fim prevista.
describe('MedicationFormScreen — múltiplos horários no cadastro (2026-08-21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedMedications.createMedication.mockResolvedValue(medication as any);
    let scheduleId = 100;
    mockedMedications.createSchedule.mockImplementation(() =>
      Promise.resolve({ id: ++scheduleId, medication_id: 10, time: '08:00:00', days_of_week: null, interval_hours: null, is_active: true }),
    );
  });

  it('cadastro começa com um horário padrão 08:00 de todos os dias já na lista', async () => {
    renderScreen();

    expect(await screen.findByText('Quantas vezes por dia?')).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('Todos os dias')).toBeTruthy();
  });

  // "Horário salva sozinho" (item 12) não se aplica no cadastro — aqui
  // os horários são rascunho local até o botão final, igual ao resto.
  it('cadastro NÃO mostra o aviso de horário salvando sozinho (é rascunho até salvar)', async () => {
    renderScreen();

    await screen.findByText('Quantas vezes por dia?');
    expect(screen.queryByText(/não precisa do botão Salvar/)).toBeNull();
  });

  it('atalho "2x por dia" substitui a lista por dois horários padrão', async () => {
    renderScreen();

    await screen.findByText('Quantas vezes por dia?');
    fireEvent.press(screen.getByLabelText('Atalho: 2x por dia'));

    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('20:00')).toBeTruthy();
    // Chip fica destacado enquanto a lista corresponde ao atalho.
    const chip = screen.getByLabelText('Atalho: 2x por dia');
    expect(chip.props.accessibilityState.selected).toBe(true);
  });

  it('salvar com o atalho 2x por dia cria DOIS schedules e agenda duas notificações', async () => {
    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByLabelText('Atalho: 2x por dia'));
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createSchedule).toHaveBeenCalledTimes(2);
      expect(mockedMedications.createSchedule).toHaveBeenNthCalledWith(1, 10, {
        time: '08:00',
        days_of_week: null,
        interval_hours: null,
      });
      expect(mockedMedications.createSchedule).toHaveBeenNthCalledWith(2, 10, {
        time: '20:00',
        days_of_week: null,
        interval_hours: null,
      });
      expect(mockedNotifications.scheduleScheduleNotifications).toHaveBeenCalledTimes(2);
    });
  });

  it('"Adicionar horário" abre o editor e acrescenta rascunho à lista', async () => {
    renderScreen();

    await screen.findByText('Quantas vezes por dia?');
    fireEvent.press(screen.getByLabelText('Adicionar horário'));
    expect(screen.getByText('Novo horário')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('08:00'), '14:00');
    fireEvent.press(screen.getByText('Adicionar'));

    expect(await screen.findByText('14:00')).toBeTruthy();
    // Dois rascunhos agora: o padrão 08:00 continua lá.
    expect(screen.getAllByText('Todos os dias')).toHaveLength(2);
  });

  it('editar rascunho pela lista atualiza a linha correspondente', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Editar horário das 08:00, Todos os dias'));
    expect(screen.getByText('Editar horário')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('08:00'), '09:30');
    fireEvent.press(screen.getByText('Salvar'));

    expect(await screen.findByText('09:30')).toBeTruthy();
    expect(screen.queryByText('08:00')).toBeNull();
  });

  // Achado real do Rilson (2026-09-07): já era possível REMOVER todos
  // os horários de um remédio já existente (fica só no estoque) — só
  // faltava a mesma liberdade no cadastro. Bloquear aqui não impedia
  // nada de verdade, só empurrava a mesma ação pra depois de criar.
  it('remover todos os horários permite cadastrar mesmo assim — vira só controle de estoque', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByLabelText('Remover horário das 08:00, Todos os dias'));

    // Aviso deixa claro que é uma escolha reconhecida (só estoque, sem
    // lembrete), não um remédio "esquecido" por engano.
    expect(await screen.findByText(/sem gerar lembrete/)).toBeTruthy();

    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalled();
    });
    expect(mockedMedications.createSchedule).not.toHaveBeenCalled();
  });

  it('sem horário nenhum, "+Adicionar" continua disponível — não é um beco sem saída', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Remover horário das 08:00, Todos os dias'));

    expect(screen.getByLabelText('Adicionar horário')).toBeTruthy();
  });

  it('preset "Seg a Sex" no editor desmarca fim de semana e a lista reflete', async () => {
    renderScreen();

    await screen.findByText('Quantas vezes por dia?');
    fireEvent.press(screen.getByLabelText('Adicionar horário'));
    fireEvent.press(screen.getByLabelText('Seg a Sex (atalho de dias da semana)'));

    // Rótulos dos círculos usam os nomes abreviados de i18n (days.*).
    expect(screen.getByLabelText('Sáb').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('Dom').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('Seg').props.accessibilityState.selected).toBe(true);

    fireEvent.press(screen.getByText('Adicionar'));

    // Rascunho novo com dias úteis; resumo vira a lista de nomes cheios.
    expect(await screen.findByText('Seg, Ter, Qua, Qui, Sex')).toBeTruthy();
  });

  // A partir de 2026-09-07, trocar pro modo "A cada X horas" já entrega
  // um rascunho padrão pronto (08:00, 8h) — não precisa abrir
  // "Adicionar" pra ganhar o primeiro horário de intervalo, só editar
  // esse que já apareceu.
  it('trocar pro modo "A cada X horas" cria um rascunho padrão, e editar pra 12h envia interval_hours', async () => {
    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Azitromicina');
    fireEvent.press(screen.getByLabelText('A cada X horas'));

    expect(await screen.findByText('A cada 8 horas')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Editar horário das 08:00, A cada 8 horas'));
    fireEvent.press(screen.getByLabelText('12h'));

    expect(screen.getByLabelText('Intervalo em horas entre as doses').props.value).toBe('12');

    fireEvent.press(screen.getByText('Salvar'));
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createSchedule).toHaveBeenCalledWith(10, {
        time: '08:00',
        days_of_week: null,
        interval_hours: 12,
      });
    });
  });
});

describe('MedicationFormScreen — duração com data de fim prevista (2026-08-21)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedMedications.createMedication.mockResolvedValue(medication as any);
  });

  it('preencher duração mostra a data de fim prevista', async () => {
    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Amoxicilina');
    fireEvent.changeText(screen.getByLabelText('Duração do tratamento em dias'), '7');

    expect(await screen.findByText(/Fim previsto:/)).toBeTruthy();
  });

  it('sem duração, não há data de fim (uso contínuo)', async () => {
    renderScreen();

    await screen.findByLabelText('Nome do medicamento');

    expect(screen.queryByText(/Fim previsto:/)).toBeNull();
  });
});

// "Foto do medicamento" (2026-08-13).
describe('MedicationFormScreen — foto do medicamento (2026-08-13)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: '10' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    mockedMedications.getMedication.mockResolvedValue(medication as any);
    jest.spyOn(Alert, 'alert');
  });

  it('sem foto, mostra o placeholder "Adicionar foto"', async () => {
    renderScreen();

    expect(await screen.findByLabelText('Adicionar foto')).toBeTruthy();
  });

  it('com foto, mostra a imagem e o rótulo vira "Trocar foto"', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);

    renderScreen();

    expect(await screen.findByLabelText('Trocar foto')).toBeTruthy();
  });

  it('escolher da galeria envia a foto e atualiza a preview', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: true } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/foto.jpg' } as any],
    } as any);
    mockedMedications.uploadMedicationPhoto.mockResolvedValueOnce({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Adicionar foto'));

    fireEvent.press(screen.getByText('Escolher da galeria'));

    await waitFor(() => {
      expect(mockedMedications.uploadMedicationPhoto).toHaveBeenCalledWith(10, 'file:///tmp/foto.jpg');
    });
    expect(await screen.findByLabelText('Trocar foto')).toBeTruthy();
  });

  it('sem permissão de galeria, não chama upload', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false } as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Adicionar foto'));

    fireEvent.press(screen.getByText('Escolher da galeria'));

    expect(mockedMedications.uploadMedicationPhoto).not.toHaveBeenCalled();
  });

  it('opção "Remover foto" só aparece quando já existe uma foto', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Trocar foto'));

    expect(screen.getByText('Remover foto')).toBeTruthy();
  });

  it('remover foto chama deleteMedicationPhoto e volta pro placeholder', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);
    mockedMedications.deleteMedicationPhoto.mockResolvedValueOnce(medication as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Trocar foto'));

    fireEvent.press(screen.getByText('Remover foto'));

    await waitFor(() => {
      expect(mockedMedications.deleteMedicationPhoto).toHaveBeenCalledWith(10);
    });
    expect(await screen.findByLabelText('Adicionar foto')).toBeTruthy();
  });
});

// "Foto no cadastro" (2026-09-07) — achado real do Rilson: só dava pra
// anexar foto editando um remédio já criado, nunca no cadastro, que é
// exatamente quando a pessoa está com a caixa/bula na mão.
describe('MedicationFormScreen — foto no cadastro (2026-09-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('a opção de foto também aparece no cadastro, não só na edição', async () => {
    renderScreen();

    expect(await screen.findByLabelText('Adicionar foto')).toBeTruthy();
  });

  it('escolher foto no cadastro guarda localmente e não sobe ainda (falta o id)', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: true } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/foto.jpg' } as any],
    } as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Adicionar foto'));
    fireEvent.press(screen.getByText('Escolher da galeria'));

    expect(await screen.findByLabelText('Trocar foto')).toBeTruthy();
    expect(screen.getByText('Foto será salva junto com o remédio.')).toBeTruthy();
    expect(mockedMedications.uploadMedicationPhoto).not.toHaveBeenCalled();
  });

  it('salvar o cadastro com foto escolhida sobe a foto assim que o remédio ganha id', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);
    mockedMedications.uploadMedicationPhoto.mockResolvedValueOnce({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: true } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/foto.jpg' } as any],
    } as any);

    renderScreen();
    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByLabelText('Adicionar foto'));
    fireEvent.press(screen.getByText('Escolher da galeria'));
    await screen.findByLabelText('Trocar foto');

    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.uploadMedicationPhoto).toHaveBeenCalledWith(10, 'file:///tmp/foto.jpg');
    });
  });

  it('sem escolher foto no cadastro, salvar não chama uploadMedicationPhoto', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);

    renderScreen();
    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalled();
    });
    expect(mockedMedications.uploadMedicationPhoto).not.toHaveBeenCalled();
  });

  it('foto que falha ao subir depois de criado não trava nem desfaz o cadastro', async () => {
    mockedMedications.createMedication.mockResolvedValueOnce(medication as any);
    mockedMedications.uploadMedicationPhoto.mockRejectedValueOnce(new Error('falha de rede'));
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: true } as any);
    mockedImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/foto.jpg' } as any],
    } as any);

    renderScreen();
    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByLabelText('Adicionar foto'));
    fireEvent.press(screen.getByText('Escolher da galeria'));
    await screen.findByLabelText('Trocar foto');

    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    // O remédio foi criado normalmente mesmo com a foto falhando — não
    // é um erro que trava o cadastro inteiro (ver `photoUploadFailed`
    // em saveMedication).
    await waitFor(() => {
      expect(mockedMedications.createMedication).toHaveBeenCalled();
      expect(mockedMedications.uploadMedicationPhoto).toHaveBeenCalledWith(10, 'file:///tmp/foto.jpg');
    });
  });
});

// "Limite de medicamentos do plano gratuito" (2026-09-07, item 14) —
// achado real do Rilson: esse erro específico caía no alerta genérico
// ("Erro" + só "OK"), sem caminho pra resolver.
describe('MedicationFormScreen — limite de medicamentos do plano gratuito (2026-09-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSearchParams.mockReturnValue({ id: 'new' });
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  });

  it('bater no limite mostra alerta convidativo com botão pra Pro, não "Erro" genérico', async () => {
    mockedMedications.createMedication.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { message: 'Limite de 15 medicamentos por perfil no plano gratuito. Faça upgrade para o Pro.' },
      },
    });

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    expect(await screen.findByText('Você atingiu o limite do plano gratuito')).toBeTruthy();
    expect(screen.queryByText('Erro')).toBeNull();

    fireEvent.press(screen.getByLabelText('Ver planos Pro'));
    expect(router.push).toHaveBeenCalledWith('/pro');
  });

  it('outros erros de criação continuam mostrando o alerta genérico "Erro", sem botão de ação', async () => {
    mockedMedications.createMedication.mockRejectedValueOnce({
      response: { status: 422, data: { message: 'Nome inválido.' } },
    });

    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'X');
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    expect(await screen.findByText('Erro')).toBeTruthy();
    expect(screen.getByText('Nome inválido.')).toBeTruthy();
    expect(screen.queryByLabelText('Ver planos Pro')).toBeNull();
  });
});
