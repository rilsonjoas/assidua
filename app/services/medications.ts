import { api } from './api';

export interface Medication {
  id: number;
  profile_id: number;
  name: string;
  dosage: string;
  unit: string;
  color: string;
  instructions: string | null;
  notes: string | null;
  is_active: boolean;
  schedules: DoseSchedule[];
  stock: StockItem | null;
  // Calculado no backend (current_quantity ÷ doses/dia médio dos
  // schedules ativos) — null sem schedule ativo ou sem estoque.
  days_remaining: number | null;
}

// Refill alert inteligente (Fase 1 do roadmap): abaixo disso, avisa na
// tela Hoje/Estoque e agenda notificação local. Sem base científica —
// é o "tempo de reação razoável pra ir à farmácia" que apps do nicho
// (Medisafe/MyTherapy) também usam como ordem de grandeza.
export const LOW_STOCK_DAYS_THRESHOLD = 7;

export interface DoseSchedule {
  id: number;
  medication_id: number;
  time: string;
  days_of_week: number[] | null;
  interval_hours: number | null;
  is_active: boolean;
}

export interface StockItem {
  id: number;
  medication_id: number;
  current_quantity: number;
  unit: string;
  min_alert_quantity: number;
  last_updated_at: string | null;
}

export async function getMedications(profileId: number): Promise<Medication[]> {
  const { data } = await api.get(`/profiles/${profileId}/medications`);
  return data;
}

export async function getMedication(id: number): Promise<Medication> {
  const { data } = await api.get(`/medications/${id}`);
  return data;
}

export async function createMedication(profileId: number, payload: Partial<Medication>) {
  const { data } = await api.post(`/profiles/${profileId}/medications`, payload);
  return data as Medication;
}

export async function updateMedication(id: number, payload: Partial<Medication>) {
  const { data } = await api.put(`/medications/${id}`, payload);
  return data as Medication;
}

export async function deleteMedication(id: number) {
  await api.delete(`/medications/${id}`);
}

export async function createSchedule(medicationId: number, payload: Partial<DoseSchedule>) {
  const { data } = await api.post(`/medications/${medicationId}/schedules`, payload);
  return data as DoseSchedule;
}

export async function updateSchedule(id: number, payload: Partial<DoseSchedule>) {
  const { data } = await api.put(`/schedules/${id}`, payload);
  return data as DoseSchedule;
}

export async function deleteSchedule(id: number): Promise<void> {
  await api.delete(`/schedules/${id}`);
}

export async function updateStock(medicationId: number, payload: Partial<StockItem>) {
  const { data } = await api.put(`/medications/${medicationId}/stock`, payload);
  return data as StockItem;
}
