import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { AdherenceRing } from '../components/AdherenceRing';

// Anel de progresso de adesão do dia (v1.3, aprovado 2026-09-02).
describe('AdherenceRing', () => {
  it('calcula e mostra a porcentagem no centro', () => {
    render(<AdherenceRing taken={3} total={5} />);
    expect(screen.getByText('60%')).toBeTruthy();
  });

  it('sem doses hoje, mostra 0% em vez de dividir por zero', () => {
    render(<AdherenceRing taken={0} total={0} />);
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('todas tomadas mostra 100%', () => {
    render(<AdherenceRing taken={4} total={4} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('anuncia a contagem certa pro leitor de tela (progressbar acessível)', () => {
    render(<AdherenceRing taken={1} total={4} />);
    const ring = screen.getByLabelText("Adesão de hoje: 1 de 4 dose tomada");
    expect(ring.props.accessibilityRole).toBe('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
  });

  it('pluraliza corretamente quando mais de uma dose foi tomada', () => {
    render(<AdherenceRing taken={2} total={4} />);
    expect(screen.getByLabelText('Adesão de hoje: 2 de 4 doses tomadas')).toBeTruthy();
  });
});
