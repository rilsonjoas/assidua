// WCAG 2.1 luminância relativa e razão de contraste — extraído da
// auditoria de cor (2026-08-14, ver __tests__/color-contrast.test.tsx)
// pro Calendário de Adesão (v1.3, 2026-09-02) também precisar: escolher
// texto preto ou branco em cima de uma cor de fundo *variável*
// (verde/amarelo/vermelho por dia), não um par fixo de tema já pensado.
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1));
  const l2 = relativeLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

// Achado real (2026-09-05, calendário de adesão): nem branco nem preto
// fixo bate 4.5:1 nos 3 tons semânticos x 2 temas ao mesmo tempo — ex.:
// branco em cima do verde escuro do tema claro passa, mas em cima do
// verde vivo do tema escuro cai pra 2.3:1. Escolhe o que der mais
// contraste caso a caso.
export function bestTextColor(backgroundHex: string): '#000000' | '#ffffff' {
  return contrastRatio('#000000', backgroundHex) >= contrastRatio('#ffffff', backgroundHex)
    ? '#000000'
    : '#ffffff';
}
