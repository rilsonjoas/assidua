import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MedicationsSort = 'alphabetical' | 'stock-low';

interface MedicationsSortState {
  sort: MedicationsSort;
  setSort: (sort: MedicationsSort) => void;
}

// "Ordenação em Remédios" (2026-09-07, item 11) — achado real do
// Rilson: nenhuma tela ordenava nada, sempre a ordem crua do backend.
// Persiste a escolha entre sessões (AsyncStorage, só local — mesmo
// padrão de `profileStore`): resetar em silêncio a cada abertura
// confundiria mais um público idoso do que lembrar a última escolha
// ("por que mudou a ordem sozinho?").
export const useMedicationsSortStore = create<MedicationsSortState>()(
  persist(
    (set) => ({
      sort: 'alphabetical',
      setSort: (sort) => set({ sort }),
    }),
    {
      name: 'medications-sort-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
