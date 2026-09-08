import React from 'react';
import { StyleSheet } from 'react-native';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StockScreen from '../app/(tabs)/stock';
import LoginScreen from '../app/(auth)/login';
import ProfileScreen from '../app/(tabs)/profile';
import HomeScreen from '../app/(tabs)/index';
import { AlertDialog } from '../components/AlertDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AdherenceCalendar } from '../components/AdherenceCalendar';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import * as medicationsService from '../services/medications';
import * as dosesService from '../services/doses';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));
jest.mock('../services/doses', () => ({
  ...(jest.requireActual('../services/doses') as object),
  getDailyAdherence: jest.fn(),
  getTodayDoses: jest.fn(),
  getAdherenceStreak: jest.fn(),
}));
jest.mock('../services/notifications');
jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const mockedMedications = jest.mocked(medicationsService);
const mockedDoses = jest.mocked(dosesService);
const mockedApi = jest.mocked(api);

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

// Um lado do hitSlop, não o objeto inteiro — os botões auditados usam
// valores diferentes conforme o espaço real disponível ao lado (ver
// comentários no código de cada tela), então o teste checa "tem hitSlop
// de verdade, coerente com o alvo mínimo", não um número mágico só.
function hitSlopSideOf(el: any, side: 'top' | 'bottom' | 'left' | 'right'): number {
  return el.props.hitSlop?.[side] ?? 0;
}

// Auditoria de toque mínimo de 48px (WCAG AAA) — 2026-09-08. Cobre
// componentes/telas de alto uso ainda sem checagem (AlertDialog,
// ConfirmDialog, Login, Profile, ícones lado a lado em Home e no
// formulário de remédio) além do que a sessão de 2026-09-05 já tinha
// testado. Não é EXAUSTIVA elemento a elemento — escolhida pra cobrir
// os padrões mais repetidos e os casos de maior risco (ícones vizinhos
// apertados, onde um hitSlop mal calculado pode fazer tocar o botão
// errado).
describe('Toque mínimo de 48px — AlertDialog e ConfirmDialog (usados em todo o app)', () => {
  it('AlertDialog: botão único e os dois botões (com ação) têm 48px', () => {
    const { rerender } = render(
      <AlertDialog visible title="Título" message="Mensagem" okLabel="OK" onDismiss={() => {}} />,
    );
    expect(minHeightOf(screen.getByLabelText('OK'))).toBeGreaterThanOrEqual(48);

    rerender(
      <AlertDialog
        visible title="Título" message="Mensagem" okLabel="Fechar" onDismiss={() => {}}
        actionLabel="Ver o Pro" onAction={() => {}}
      />,
    );
    expect(minHeightOf(screen.getByLabelText('Fechar'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Ver o Pro'))).toBeGreaterThanOrEqual(48);
  });

  it('ConfirmDialog: cancelar e confirmar têm 48px', () => {
    render(
      <ConfirmDialog
        visible title="Tem certeza?" message="Mensagem" cancelLabel="Cancelar" confirmLabel="Confirmar"
        onCancel={() => {}} onConfirm={() => {}}
      />,
    );
    expect(minHeightOf(screen.getByLabelText('Cancelar'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Confirmar'))).toBeGreaterThanOrEqual(48);
  });
});

describe('Toque mínimo de 48px — Login', () => {
  it('botão de enviar link e o de Google têm 48px', async () => {
    render(<LoginScreen />);
    expect(minHeightOf(await screen.findByLabelText('Enviar link de acesso'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Entrar com Google'))).toBeGreaterThanOrEqual(48);
  });
});

describe('Toque mínimo de 48px — Perfil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 10, name: 'Rilson', email: 'r@x.com', subscription_tier: 'free' } as any });
    useProfileStore.setState({ profiles: [profile as any], activeProfile: profile as any });
    mockedApi.get.mockResolvedValue({ data: [profile] });
  });

  function renderProfile() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ProfileScreen />
      </QueryClientProvider>,
    );
  }

  it('"Sair" e "Excluir conta" têm 48px', async () => {
    renderProfile();
    expect(minHeightOf(await screen.findByLabelText('Sair da conta'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Excluir conta'))).toBeGreaterThanOrEqual(48);
  });

  it('botões de Cancelar/Criar do formulário de novo perfil têm 48px', async () => {
    renderProfile();
    fireEvent.press(await screen.findByLabelText('Novo Perfil'));
    expect(minHeightOf(await screen.findByLabelText('Cancelar'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Criar perfil'))).toBeGreaterThanOrEqual(48);
  });
});

describe('Toque mínimo de 48px — ícones lado a lado (hitSlop, não crescer a caixa)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile as any], activeProfile: profile as any });
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

  it('botões "Adicionar"/"Definir"/"Cancelar" do estoque têm 48px de altura mínima', async () => {
    mockedMedications.getMedications.mockResolvedValue([medication as any]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StockScreen />
      </QueryClientProvider>,
    );

    fireEvent.press(await screen.findByTestId('edit-stock-10'));

    expect(minHeightOf(screen.getByLabelText('Cancelar'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Adicionar ao estoque de Losartana'))).toBeGreaterThanOrEqual(48);
    expect(minHeightOf(screen.getByLabelText('Definir estoque de Losartana'))).toBeGreaterThanOrEqual(48);
  });

  // "Pular" (X) e "Reagir" (coração) são ícones sozinhos ao lado de
  // botões com texto — crescer a caixa pra 48x48 tinha inflado a
  // fileira toda (achado do próprio Rilson revisando esta auditoria).
  // hitSlop preserva o visual compacto; o teste confirma que o hitSlop
  // existe e é generoso o bastante pra valer a pena, sem exigir um
  // número mágico exato (o valor certo depende do espaço ao lado).
  it('"Pular" (Home) tem hitSlop generoso, sem crescer a caixa visual', async () => {
    mockedDoses.getTodayDoses.mockResolvedValue([{
      id: 'pending_5', dose_schedule_id: 5, medication_id: 10, profile_id: 1,
      scheduled_at: '2026-08-08T08:00:00.000Z', taken_at: null, status: 'pending' as const, notes: null,
      medication, dose_schedule: { id: 5, medication_id: 10, time: '08:00', days_of_week: null, interval_hours: null, is_active: true },
    }] as any);
    mockedDoses.getAdherenceStreak.mockResolvedValue({ current_streak: 0, best_streak: 0 } as any);
    mockedApi.get.mockResolvedValue({ data: [profile] });
    mockedApi.put.mockResolvedValue({ data: {} } as any);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <HomeScreen />
      </QueryClientProvider>,
    );

    // Regex, não hora fixa (a suíte roda em America/Sao_Paulo — um
    // horário UTC fixo formatado na hora local não bate com "08:00").
    const skipBtn = await screen.findByLabelText(/^Pular Losartana das/);
    // Caixa visual continua pequena (padding 6 + ícone ~16px)...
    expect(minHeightOf(skipBtn)).toBeLessThan(48);
    // ...mas o hitSlop cobre a diferença até os 48px de área de toque.
    expect(hitSlopSideOf(skipBtn, 'top')).toBeGreaterThanOrEqual(8);
    expect(hitSlopSideOf(skipBtn, 'bottom')).toBeGreaterThanOrEqual(8);
  });
});
