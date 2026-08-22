import { useWindowDimensions } from 'react-native';

// Breakpoint único da v1 web (W1, 2026-08-22): ≥768px conta como tela
// larga (tablet landscape/desktop). O app-frame centralizado no
// _layout usa isso; telas individuais podem usar pra refinamentos
// desktop próprios no futuro.
export function useIsWideScreen(minWidth = 768): boolean {
  const { width } = useWindowDimensions();
  return width >= minWidth;
}
