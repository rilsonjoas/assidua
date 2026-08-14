import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { AdherenceChart } from '../components/AdherenceChart';
import { WeeklyAdherencePoint } from '../services/doses';

// Achado real de uso, anotado no Obsidian (2026-08-14): "gráfico de
// adesão só esqueleto quando não há nada registrado; estranho pro
// usuário final". Não havia teste nenhum cobrindo este componente
// antes — nem o caso vazio nem o caso com dado real.
describe('AdherenceChart', () => {
  it('não renderiza nada quando o array de dados está vazio', () => {
    const { toJSON } = render(<AdherenceChart data={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('mostra estado vazio explicativo quando nenhuma semana tem dado (todo percentage null)', () => {
    const data: WeeklyAdherencePoint[] = [
      { week_start: '2026-08-03', week_end: '2026-08-09', percentage: null, taken: 0, due: 0 },
      { week_start: '2026-08-10', week_end: '2026-08-16', percentage: null, taken: 0, due: 0 },
    ];

    render(<AdherenceChart data={data} />);

    expect(screen.getByText(/Ainda não há doses registradas/)).toBeTruthy();
    // Não deve desenhar a fileira de barrinhas com "—" no lugar.
    expect(screen.queryByText('—')).toBeNull();
  });

  it('mostra as barras normalmente quando há pelo menos uma semana com dado', () => {
    const data: WeeklyAdherencePoint[] = [
      { week_start: '2026-08-03', week_end: '2026-08-09', percentage: null, taken: 0, due: 0 },
      { week_start: '2026-08-10', week_end: '2026-08-16', percentage: 80, taken: 8, due: 10 },
    ];

    render(<AdherenceChart data={data} />);

    expect(screen.getByText('80%')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText(/Ainda não há doses registradas/)).toBeNull();
  });
});
