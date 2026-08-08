// Interface explícita, não `typeof lightColors` — com `typeof` o tipo
// carrega os valores literais do tema claro, e o tema escuro (valores
// literais diferentes) nunca bate no type-check. Bug real, achado ao
// rodar `tsc --noEmit` no mobile pela primeira vez (nunca rodava em CI).
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceSecondary: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  brand: string;
  brandLight: string;
  brandSubtle: string;
  headerBg: string;
  headerText: string;
  headerSubtext: string;
  tabBar: string;
  tabBarBorder: string;
  success: string;
  warning: string;
  error: string;
}

export const lightColors: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSecondary: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  brand: '#6366f1',
  brandLight: '#c7d2fe',
  brandSubtle: '#eef2ff',
  headerBg: '#6366f1',
  headerText: '#ffffff',
  headerSubtext: '#c7d2fe',
  tabBar: '#ffffff',
  tabBarBorder: '#f1f5f9',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

export const darkColors: ThemeColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceSecondary: '#111827',
  border: '#334155',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  brand: '#818cf8',
  brandLight: '#3730a3',
  brandSubtle: '#1e1b4b',
  headerBg: '#1e1b4b',
  headerText: '#e0e7ff',
  headerSubtext: '#818cf8',
  tabBar: '#1e293b',
  tabBarBorder: '#334155',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};
