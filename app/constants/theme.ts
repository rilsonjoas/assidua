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
  // Texto sobre fundo colorido com `c.brand` (botões, chips ativos).
  // Precisa ser um token à parte porque, no tema escuro, `brand` é
  // claro (funciona bem como texto sobre fundo escuro) — texto branco
  // *sobre* ele erra o contraste (ver auditoria de 2026-08-14).
  onBrand: string;
  headerBg: string;
  headerText: string;
  headerSubtext: string;
  tabBar: string;
  tabBarBorder: string;
  success: string;
  warning: string;
  error: string;
}

// Auditoria de contraste WCAG AA (2026-08-14, pedido direto do Rilson:
// "vamos deixar o mais elderly friendly possível" — catarata/baixa
// visão é comum na terceira idade, e vários tokens abaixo falhavam a
// razão mínima de contraste mesmo pra texto grande). Valores originais
// e o que mudou, documentado por token:
//   - brand '#6366f1'→'#4f46e5': texto pequeno sobre fundo claro dava
//     4.47:1 (abaixo de 4.5 exigido pra texto normal); também é o
//     `headerBg` do tema claro, então corrigia os dois de uma vez.
//   - headerSubtext '#c7d2fe'→'#eef2ff': 2.99:1 sobre o header — falha
//     feia, texto sempre visível (data + progresso do dia na Home).
//   - textMuted '#94a3b8'→'#8190a6': 2.45:1, abaixo até do mínimo pra
//     texto grande (3:1). Novo valor limpa 3:1 com folga; ainda fica
//     abaixo de 4.5:1 de propósito — é o tom mais claro dos três
//     níveis de texto, reservado pra legenda/ícone, não corpo de texto
//     pequeno crítico (isso usa `textSecondary`, que já passa 4.5:1).
//   - success '#22c55e'→'#15803d', warning '#f59e0b'→'#b45309': usados
//     como cor de *texto* (ex.: "Tomado", horário atrasado, aviso de
//     estoque baixo) davam 2.05–2.28:1 — falha grave, não só técnica.
export const lightColors: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceSecondary: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#8190a6',
  brand: '#4f46e5',
  brandLight: '#c7d2fe',
  brandSubtle: '#eef2ff',
  onBrand: '#ffffff',
  headerBg: '#4f46e5',
  headerText: '#ffffff',
  headerSubtext: '#eef2ff',
  tabBar: '#ffffff',
  tabBarBorder: '#f1f5f9',
  success: '#15803d',
  warning: '#b45309',
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
  // Achado real: `brand` no escuro é claro (lavanda) de propósito —
  // funciona bem como *texto* sobre fundo escuro (4.9–6:1). Mas texto
  // branco *sobre* um botão dessa cor (uso mais comum de `brand`) dava
  // só 2.98:1, abaixo até do mínimo de 3:1. `onBrand` escuro = o
  // próprio `background` (quase preto), que dá 5.98:1 sobre a lavanda.
  onBrand: '#0f172a',
  headerBg: '#1e1b4b',
  headerText: '#e0e7ff',
  headerSubtext: '#818cf8',
  tabBar: '#1e293b',
  tabBarBorder: '#334155',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};
