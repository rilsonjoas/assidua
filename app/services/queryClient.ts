import { QueryClient } from '@tanstack/react-query';

// Extraído de _layout.tsx (2026-08-17) — precisa ser uma instância
// compartilhada porque services/sync.ts também precisa invalidar
// queries depois de drenar a fila offline, fora de um componente React.
export const queryClient = new QueryClient();
