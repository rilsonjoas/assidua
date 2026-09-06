import { useColorScheme } from 'react-native';
import { useThemeStore } from '../store/themeStore';
import { useHighContrastStore } from '../store/highContrastStore';
import { lightColors, darkColors, highContrastLightColors, highContrastDarkColors, ThemeColors } from '../constants/theme';

// Alto Contraste (v1.3, 2026-09-02) é ortogonal ao claro/escuro — troca
// a PALETA (mira AAA, ver constants/theme.ts), não decide claro vs.
// escuro sozinho. Continua respeitando a escolha de tema de quem ativa.
export function useTheme(): { isDark: boolean; colors: ThemeColors } {
  const systemScheme = useColorScheme();
  const { mode } = useThemeStore();
  const isHighContrast = useHighContrastStore((s) => s.isHighContrast);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const colors = isHighContrast
    ? (isDark ? highContrastDarkColors : highContrastLightColors)
    : (isDark ? darkColors : lightColors);

  return { isDark, colors };
}
