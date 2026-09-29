// Escala de espaçamento, raio e tipografia — o irmão de `theme.ts`.
//
// `theme.ts` cuida de COR. Este arquivo cuida de GEOMETRIA, e existia
// como número mágico espalhado: 20 valores de `borderRadius` distintos
// (4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 19, 20, 22, 28, 32, 36, 48,
// 56) e 15 de `fontSize` (10 ao 28), nenhum vindo de token nenhum. É a
// razão de duas telas do mesmo app parecerem feitas por pessoas
// diferentes — não por falta de paleta, que sempre esteve centralizada.
//
// As escalas abaixo NÃO são invenção: foram derivadas da contagem real de
// uso no app (ver `docs/tokens-derivacao.md`), de modo que a migração
// troca número mágico por token. O que sobra é normalizado pro valor mais
// próximo da escala — essa parte é MUDANÇA VISUAL de propósito, e está
// medida: 231 dos ~1.400 pontos migrados mudaram de tamanho, quase todos
// 2px (padding 14->12, gap 6->4, raio 10->12). A lista completa do que
// mudou está em `docs/tokens-derivacao.md`; ela existe porque "normalizar
// pra escala" é o tipo de coisa que parece inofensiva no diff e aparece
// no aparelho.
//
// Dois casos que a normalização NÃO pode tratar sozinha, e por isso foram
// revisados à mão (ver histórico de 2026-09-28):
//   - `fontSize` 18–28 era TÍTULO (login, cabeçalho da Home, estado
//     vazio, resumo do Histórico). Uma primeira versão da escala parava
//     em 17 e achatou todos pra `critical` — destruiu a hierarquia. A
//     escala ganhou `display`/`metric`/`heading`/`section`/`homeHeader`
//     por causa disso.
//   - `borderRadius` 32/36/48/56 eram círculos perfeitos (width === height
//     em todos os quatro casos) e foram para `full`, que é a decisão
//     certa, não um acidente da escala.
//
// Regra de ouro daqui pra frente: se o valor que você precisa não existe
// aqui, o erro é do valor, não da escala. Não invente 18px de raio porque
// "queria algo mais arredondado" — use `md` (12) ou `lg` (16).

// Grade de 4px. Todo padding, margin, gap e offset do app sai daqui.
// `none` existe porque "sem espaçamento" é um valor de design — usá-lo
// é diferente de não declarar nada, e é o que permite `gap: spacing.none`
// dizer o que quer em vez de faltar a propriedade.
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

// Raio. Subconjunto dos 20 valores que o app usava, mantendo a ordem
// visual de "mais reto" pra "mais redondo". Os tokens de 24/32/48/56 que
// existiam (avatares, botões de mídia, FAB) viraram `full` quando eram
// círculo de verdade e `xxl`/`xxxl` quando eram só "bem grande".
export const rounded = {
  none: 0,
  sm: 8, // campos compactos, chips
  md: 12, // padrão: botões, inputs, cards de item
  lg: 16, // cards principais
  xl: 20, // cards de destaque
  xxl: 28, // superfícies grandes
  full: 9999, // avatares, FAB, badges — só onde é círculo/pílula de verdade
} as const;

// Escala tipográfica.
//
// PISO ABSOLUTO DE 13px. O app tinha `fontSize: 10` (7 usos) e `11`
// (3 usos) — abaixo do piso que o próprio ROADMAP e o DESIGN.md exigem, e
// ilegível justamente para quem precisa de legibilidade. Subiram para 13.
//
// O `12px` (27 usos) foi examinado e MANTIDO, por decisão de 2026-09-28:
// falta 1px pro piso, mas é um Capacitor em badge/legenda — não é o
// problema que o 10px representa, e trocar 27 ocorrências espalhadas por
// 1px seria diff largo com ganho visual zero. Fica como exceção
// documentada, não como acidente. O teste de tipografia checa 10 e 11
// (os ilegíveis de verdade), não o 12.
//
// A inversão é deliberada e é a decisão mais importante desta escala: a
// informação mais importante da tela é a MAIOR. O nome do remédio e a
// hora da dose usam `critical` (17, negrito) — não o título da tela, não
// um badge. Badge e metadado são a menor coisa do card.
//
// Os degraus acima de 17 são TÍTULO, não conteúdo: `display` para a tela
// de login/cadastro, `heading` para o cabeçalho da Home e estados vazios,
// `metric` para o número grande do resumo do Histórico. Nenhuma dessas
// funções carrega dado clínico que o usuário precise ler rápido — por
// isso `critical` (17) é menor que `display` (28) e ainda assim mais
// importante: hierarquia por função, não por tamanho bruto.
export const type = {
  display: 28, // título de tela cheia (login, cadastro)
  metric: 26, // número de resumo no Histórico
  homeHeader: 24, // data + contagem no cabeçalho da Home
  heading: 22, // cabeçalho do onboarding, erro, bloqueio biométrico
  section: 20, // cabeçalho de seção, PrivacyBlur, nome do usuário
  critical: 17, // nome do remédio, hora da dose — o que importa na dose
  body: 16, // corpo de texto, inputs (ênfase é fontWeight, não outro tamanho)
  label: 15, // labels de campo, botões
  caption: 14, // dosagem, instrução, timestamp
  micro: 13, // badge, legenda, metadado — o piso
  microTight: 12, // exceção documentada: badge/legenda apertada (ver acima)
} as const;

// Tabela de correspondência usada na migração: valor mágico -> token.
// Mantida no repo de propósito — é o registro do que foi normalizado e
// por quê, e evita alguém "corrigir" de volta.
export const radiusMigration: Record<number, number> = {
  0: 0,
  4: 8,
  5: 8,
  6: 8,
  7: 8,
  8: 8,
  9: 12,
  10: 12,
  12: 12,
  14: 16,
  15: 16,
  16: 16,
  18: 20,
  19: 20,
  20: 20,
  22: 28,
  28: 28,
  32: 28,
  36: 28,
  48: 9999,
  56: 9999,
};

export const spacingMigration: Record<number, number> = {
  2: 2,
  4: 4,
  6: 4,
  8: 8,
  10: 8,
  12: 12,
  14: 12,
  16: 16,
  18: 16,
  20: 20,
  22: 20,
  24: 24,
  28: 24,
  30: 32,
  32: 32,
  36: 32,
  40: 40,
  48: 48,
};

export const fontSizeMigration: Record<number, number> = {
  10: 13, // 10 -> 13: era ilegível, e o piso é 13
  11: 13, // 11 -> 13: idem
  12: 12, // 12 -> 12: exceção documentada (type.microTight)
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  17: 17,
  18: 20, // 18 -> 20: era título de estado vazio/nome; virou type.section
  19: 20,
  20: 20,
  22: 22,
  24: 24,
  26: 26,
  28: 28,
};

export type SpacingToken = keyof typeof spacing;
export type RoundedToken = keyof typeof rounded;
export type TypeToken = keyof typeof type;
