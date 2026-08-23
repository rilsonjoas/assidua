import { Platform } from 'react-native';
import { api } from './api';

// Achado real de uso (2026-08-14): sem isto, cada tela que monta
// "dosagem + unidade" tinha que lembrar sozinha de tratar `dosage`
// nulo — um esqueceu e mostraria literalmente "null" (template
// literal) ou um espaço em branco solto (JSX). Uma função só, usada
// em todo lugar que exibe isso (lista de remédios, histórico, Home,
// notificação), garante o mesmo comportamento sempre: sem dosagem,
// mostra só a unidade (que sempre existe — tem default no backend).
export function formatDosageUnit(dosage: string | null, unit: string): string {
  return dosage ? `${dosage} ${unit}` : unit;
}

export interface Medication {
  id: number;
  profile_id: number;
  name: string;
  // Achado real de uso (2026-08-14): nem todo remédio tem dosagem
  // numérica relevante — deixou de ser obrigatório nos dois lados.
  dosage: string | null;
  unit: string;
  color: string;
  instructions: string | null;
  notes: string | null;
  is_active: boolean;
  // Fase 2 (2026-08-12) — "Pausar medicamento": diferente de is_active,
  // continua visível na lista; só para de gerar dose/notificação.
  is_paused: boolean;
  schedules: DoseSchedule[];
  stock: StockItem | null;
  // Calculado no backend (current_quantity ÷ doses/dia médio dos
  // schedules ativos) — null sem schedule ativo ou sem estoque.
  days_remaining: number | null;
  // "Foto do medicamento" (2026-08-13) — URL pronta pra usar, o app
  // nunca vê o caminho interno de armazenamento do servidor.
  photo_url: string | null;
  // "Duração do tratamento" (2026-08-14) — opcional; quando setado, o
  // backend calcula treatment_ends_at a partir de created_at, pronto
  // pra usar (data no formato YYYY-MM-DD), sem o app recalcular.
  treatment_duration_days: number | null;
  treatment_ends_at: string | null;
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

// "Foto do medicamento" (2026-08-13) — `imageUri` vem do
// expo-image-picker (`result.assets[0].uri`), formato `file://...`.
export async function uploadMedicationPhoto(medicationId: number, imageUri: string): Promise<Medication> {
  const rawFilename = imageUri.split('/').pop()?.split('?')[0] ?? 'photo.jpg';
  const filename = rawFilename.includes('.') ? rawFilename : `${rawFilename}.jpg`;
  const extMatch = /\.(\w+)$/.exec(filename);
  const type = extMatch ? `image/${extMatch[1].toLowerCase()}` : 'image/jpeg';

  const formData = new FormData();
  if (Platform.OS === 'web') {
    const res = await fetch(imageUri);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || type });
    formData.append('photo', file);
  } else {
    formData.append('photo', { uri: imageUri, name: filename, type } as any);
  }

  const { data } = await api.post(`/medications/${medicationId}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as Medication;
}

export async function deleteMedicationPhoto(medicationId: number): Promise<Medication> {
  const { data } = await api.delete(`/medications/${medicationId}/photo`);
  return data as Medication;
}
