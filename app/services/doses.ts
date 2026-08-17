import { api } from './api';
import { Medication, DoseSchedule } from './medications';

export interface DoseLog {
  id: number | string; // 'pending_<scheduleId>' quando ainda não registrado
  dose_schedule_id: number;
  medication_id: number;
  profile_id: number;
  scheduled_at: string;
  taken_at: string | null;
  status: 'taken' | 'skipped' | 'missed' | 'pending';
  notes: string | null;
  medication: Medication;
  dose_schedule: DoseSchedule;
  // Fase 2 (2026-08-11) — só presente na resposta do POST que marcou a
  // dose como tomada, e só quando essa ação especificamente completou o
  // dia E o streak resultante bate 7/30/60. null no resto do tempo.
  streak_milestone?: number | null;
  // Offline support (2026-08-17) — só existe no cache local otimista,
  // nunca vem da API. Marca uma dose que foi marcada/desmarcada sem
  // internet e ainda está na fila esperando sincronizar.
  _pendingSync?: boolean;
}

export interface AdherenceStreak {
  current_streak: number;
  best_streak: number;
}

// "Gráfico de adesão" (Fase 2, 2026-08-13).
export interface WeeklyAdherencePoint {
  week_start: string;
  week_end: string;
  percentage: number | null;
  taken: number;
  due: number;
}

export async function getTodayDoses(profileId: number): Promise<DoseLog[]> {
  const { data } = await api.get(`/profiles/${profileId}/doses/today`);
  return data;
}

export async function getAdherenceStreak(profileId: number): Promise<AdherenceStreak> {
  const { data } = await api.get(`/profiles/${profileId}/streak`);
  return data;
}

export async function getWeeklyAdherence(profileId: number): Promise<WeeklyAdherencePoint[]> {
  const { data } = await api.get(`/profiles/${profileId}/weekly-adherence`);
  return data;
}

export interface HistoryFilters {
  status?: 'taken' | 'skipped' | 'missed';
  medication_id?: number;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export async function getDoseHistory(profileId: number, filters: HistoryFilters = {}) {
  const { data } = await api.get(`/profiles/${profileId}/doses/history`, {
    params: { page: 1, ...filters },
  });
  return data;
}

export async function logDose(payload: {
  dose_schedule_id: number;
  medication_id: number;
  profile_id: number;
  scheduled_at: string;
  taken_at?: string;
  status: 'taken' | 'skipped' | 'missed';
  notes?: string;
}): Promise<DoseLog> {
  const { data } = await api.post('/dose-logs', payload);
  return data;
}

// Corrigir dose (Fase 1 do roadmap) — desmarcar um "Tomei"/"Pulei" feito
// por engano. `id` só é um número de verdade quando a dose já foi
// registrada (ver comentário em DoseLog.id acima); undoDose só deve ser
// chamado nesse caso.
export async function undoDose(doseLogId: number): Promise<void> {
  await api.delete(`/dose-logs/${doseLogId}`);
}
