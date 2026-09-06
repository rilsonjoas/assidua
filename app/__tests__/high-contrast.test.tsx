import React from 'react';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { useTheme } from '../hooks/useTheme';
import { useThemeStore } from '../store/themeStore';
import { useHighContrastStore } from '../store/highContrastStore';
import { AppText as Text } from '../components/AppText';
import { lightColors, darkColors, highContrastLightColors, highContrastDarkColors } from '../constants/theme';

// Modo Alto Contraste (v1.3, aprovado 2026-09-02) — ortogonal ao tema
// claro/escuro: troca a paleta (mira AAA, ver color-contrast.test.tsx),
// não decide claro vs. escuro sozinho.
function Probe() {
  const { colors } = useTheme();
  return <Text testID="probe-color">{colors.text}</Text>;
}

describe('useTheme — Modo Alto Contraste', () => {
  beforeEach(() => {
    useThemeStore.setState({ mode: 'light' });
    useHighContrastStore.setState({ isHighContrast: false });
  });

  it('desligado, tema claro normal usa a paleta clara comum', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe-color').props.children).toBe(lightColors.text);
  });

  it('ligado, tema claro usa a paleta clara de alto contraste', () => {
    useHighContrastStore.setState({ isHighContrast: true });
    render(<Probe />);
    expect(screen.getByTestId('probe-color').props.children).toBe(highContrastLightColors.text);
  });

  it('ligado, tema escuro usa a paleta escura de alto contraste (não a clara)', () => {
    useThemeStore.setState({ mode: 'dark' });
    useHighContrastStore.setState({ isHighContrast: true });
    render(<Probe />);
    expect(screen.getByTestId('probe-color').props.children).toBe(highContrastDarkColors.text);
  });

  it('desligado, tema escuro continua na paleta escura comum (não muda sozinho pro alto contraste)', () => {
    useThemeStore.setState({ mode: 'dark' });
    render(<Probe />);
    expect(screen.getByTestId('probe-color').props.children).toBe(darkColors.text);
  });
});
