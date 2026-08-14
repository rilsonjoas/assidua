import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Skeleton, SkeletonList } from '../components/Skeleton';
import MedicationsScreen from '../app/(tabs)/medications';
import { useProfileStore } from '../store/profileStore';
import * as medicationsService from '../services/medications';

jest.mock('../services/medications', () => ({
  ...(jest.requireActual('../services/medications') as object),
  getMedications: jest.fn(),
}));

const mockedMedications = jest.mocked(medicationsService);

describe('Skeleton — componente base', () => {
  it('renderiza um Skeleton sozinho sem quebrar', () => {
    render(<Skeleton width={100} height={20} />);
    // Não tem texto/role pra buscar (é decorativo) — só confirma que
    // montar/desmontar não lança (o loop de Animated é o risco real
    // aqui, ver useEffect cleanup no componente).
  });

  it('SkeletonList renderiza `count` itens', () => {
    render(<SkeletonList count={5} />);
    expect(screen.getByTestId('skeleton-list', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('MedicationsScreen — skeleton durante carregamento (Fase 2, 2026-08-12)', () => {
  const profile = { id: 1, user_id: 1, name: 'Rilson', color: '#6366f1', avatar_emoji: 'account', is_active: true };

  beforeEach(() => {
    jest.clearAllMocks();
    useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  });

  function renderMedications() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MedicationsScreen />
      </QueryClientProvider>,
    );
  }

  it('mostra o skeleton enquanto carrega e troca pro conteúdo real depois', async () => {
    let resolveFetch: (value: unknown) => void;
    mockedMedications.getMedications.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; }) as any,
    );

    renderMedications();

    expect(screen.getByTestId('skeleton-list', { includeHiddenElements: true })).toBeTruthy();

    resolveFetch!([]);

    // Timeout maior que o padrão (1s): sob a suíte inteira rodando em
    // paralelo, resolver a promise manual + re-render do QueryClient às
    // vezes passa de 1s — não é falha de lógica, é falta de folga.
    await waitFor(() => {
      expect(screen.queryByTestId('skeleton-list', { includeHiddenElements: true })).toBeNull();
    }, { timeout: 5000 });
    expect(await screen.findByText('Nenhum medicamento cadastrado.')).toBeTruthy();
  });
});
