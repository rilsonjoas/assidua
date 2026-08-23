import React from 'react';
import { Alert } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
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

  it('trocar pra "A cada X horas" esconde os dias e mostra o campo de intervalo', async () => {
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Adicionar horário'));
    fireEvent.press(screen.getByLabelText('A cada X horas'));

    expect(screen.getByText('De quantas em quantas horas')).toBeTruthy();
    expect(screen.queryByText('Dias da semana')).toBeNull();
  });

  it('salvar em modo intervalo envia interval_hours e days_of_week null', async () => {
    const created = { id: 99, medication_id: 10, time: '07:00:00', days_of_week: null, interval_hours: 8, is_active: true };
    mockedMedications.createSchedule.mockResolvedValueOnce(created as any);

    renderScreen();

    fireEvent.press(await screen.findByLabelText('Adicionar horário'));
    fireEvent.press(screen.getByLabelText('A cada X horas'));
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
    renderScreen();

    fireEvent.press(await screen.findByLabelText('Adicionar horário'));
    fireEvent.press(screen.getByLabelText('A cada X horas'));
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

  it('remover todos os horários bloqueia o salvamento com aviso claro', async () => {
    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Losartana');
    fireEvent.press(screen.getByLabelText('Remover horário das 08:00, Todos os dias'));
    fireEvent.press(screen.getByText('Cadastrar medicamento'));

    // AlertDialog estilizado (2026-08-23), não mais Alert.alert nativo.
    expect(await screen.findByText('Adicione ao menos um horário antes de salvar.')).toBeTruthy();
    expect(mockedMedications.createMedication).not.toHaveBeenCalled();
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

  it('preset "8h" de intervalo preenche o campo e salvar usa interval_hours', async () => {
    renderScreen();

    fireEvent.changeText(await screen.findByLabelText('Nome do medicamento'), 'Azitromicina');
    await screen.findByText('Quantas vezes por dia?');
    fireEvent.press(screen.getByLabelText('Adicionar horário'));
    fireEvent.press(screen.getByLabelText('A cada X horas'));
    fireEvent.press(screen.getByLabelText('12h'));

    expect(screen.getByLabelText('Intervalo em horas entre as doses').props.value).toBe('12');

    fireEvent.press(screen.getByText('Adicionar'));
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

    // Alert.alert com as opções — simula o toque em "Escolher da galeria".
    const alertOptions = (Alert.alert as jest.Mock).mock.calls[0][2] as any[];
    const galleryOption = alertOptions.find((o) => o.text === 'Escolher da galeria');
    await galleryOption.onPress();

    await waitFor(() => {
      expect(mockedMedications.uploadMedicationPhoto).toHaveBeenCalledWith(10, 'file:///tmp/foto.jpg');
    });
    expect(await screen.findByLabelText('Trocar foto')).toBeTruthy();
  });

  it('sem permissão de galeria, não chama upload', async () => {
    mockedImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false } as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Adicionar foto'));

    const alertOptions = (Alert.alert as jest.Mock).mock.calls[0][2] as any[];
    const galleryOption = alertOptions.find((o) => o.text === 'Escolher da galeria');
    await galleryOption.onPress();

    expect(mockedMedications.uploadMedicationPhoto).not.toHaveBeenCalled();
  });

  it('opção "Remover foto" só aparece quando já existe uma foto', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Trocar foto'));

    const alertOptions = (Alert.alert as jest.Mock).mock.calls[0][2] as any[];
    expect(alertOptions.some((o) => o.text === 'Remover foto')).toBe(true);
  });

  it('remover foto chama deleteMedicationPhoto e volta pro placeholder', async () => {
    mockedMedications.getMedication.mockResolvedValue({ ...medication, photo_url: 'https://api.example.com/storage/foto.jpg' } as any);
    mockedMedications.deleteMedicationPhoto.mockResolvedValueOnce(medication as any);

    renderScreen();
    fireEvent.press(await screen.findByLabelText('Trocar foto'));

    const alertOptions = (Alert.alert as jest.Mock).mock.calls[0][2] as any[];
    const removeOption = alertOptions.find((o) => o.text === 'Remover foto');
    await removeOption.onPress();

    await waitFor(() => {
      expect(mockedMedications.deleteMedicationPhoto).toHaveBeenCalledWith(10);
    });
    expect(await screen.findByLabelText('Adicionar foto')).toBeTruthy();
  });
});
