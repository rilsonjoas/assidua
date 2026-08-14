import React from 'react';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { AppText } from '../components/AppText';
import { useFontScaleStore } from '../store/fontScaleStore';

// "Tamanho da fonte" (2026-08-14, prep pra Acessibilidade de leitura) —
// controle de fonte dentro do app, complementar ao `allowFontScaling`
// do sistema (que já funcionava sozinho, mas essa faixa etária nem
// sempre sabe mexer nas configurações de acessibilidade do aparelho).
describe('AppText — escala de fonte configurável', () => {
  beforeEach(() => {
    useFontScaleStore.setState({ mode: 'normal' });
  });

  it('não altera o fontSize quando o modo é normal (escala 1x)', () => {
    render(<AppText style={{ fontSize: 16 }}>Olá</AppText>);

    const node = screen.getByText('Olá');
    expect(node.props.style.fontSize).toBe(16);
  });

  it('multiplica o fontSize em 1.15x no modo grande', () => {
    useFontScaleStore.setState({ mode: 'large' });
    render(<AppText style={{ fontSize: 16 }}>Olá</AppText>);

    const node = screen.getByText('Olá');
    expect(node.props.style.fontSize).toBeCloseTo(18.4);
  });

  it('multiplica o fontSize em 1.3x no modo extra grande', () => {
    useFontScaleStore.setState({ mode: 'extraLarge' });
    render(<AppText style={{ fontSize: 20 }}>Olá</AppText>);

    const node = screen.getByText('Olá');
    expect(node.props.style.fontSize).toBeCloseTo(26);
  });

  it('não quebra texto sem fontSize explícito no style', () => {
    useFontScaleStore.setState({ mode: 'extraLarge' });
    render(<AppText style={{ color: '#000' }}>Sem tamanho definido</AppText>);

    const node = screen.getByText('Sem tamanho definido');
    expect(node.props.style.fontSize).toBeUndefined();
    expect(node.props.style.color).toBe('#000');
  });

  it('lida com array de styles (StyleSheet.flatten) igual ao Text nativo', () => {
    useFontScaleStore.setState({ mode: 'large' });
    render(<AppText style={[{ color: '#111' }, { fontSize: 10 }]}>Combinado</AppText>);

    const node = screen.getByText('Combinado');
    expect(node.props.style.fontSize).toBeCloseTo(11.5);
    expect(node.props.style.color).toBe('#111');
  });
});
