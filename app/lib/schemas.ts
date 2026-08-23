import { z } from 'zod';

export const DoseScheduleSchema = z.object({
  id: z.number(),
  medication_id: z.number(),
  time: z.string(),
  days_of_week: z.array(z.number()).nullable().optional(),
  interval_hours: z.number().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const StockItemSchema = z.object({
  id: z.number(),
  medication_id: z.number(),
  current_quantity: z.number(),
  unit: z.string(),
  min_alert_quantity: z.number().default(0),
  last_updated_at: z.string().nullable().optional(),
});

export const MedicationSchema = z.object({
  id: z.number(),
  profile_id: z.number(),
  name: z.string(),
  dosage: z.string().nullable().optional(),
  unit: z.string(),
  color: z.string().default('#4f46e5'),
  instructions: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  is_paused: z.boolean().default(false),
  schedules: z.array(DoseScheduleSchema).default([]),
  stock: StockItemSchema.nullable().optional(),
  days_remaining: z.number().nullable().optional(),
  photo_url: z.string().nullable().optional(),
  treatment_duration_days: z.number().nullable().optional(),
  treatment_ends_at: z.string().nullable().optional(),
});

export const ProfileSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  name: z.string(),
  is_owner: z.boolean().default(false),
  avatar_url: z.string().nullable().optional(),
});

export function parseMedication(data: unknown) {
  return MedicationSchema.parse(data);
}

export function parseMedicationList(data: unknown) {
  return z.array(MedicationSchema).parse(data);
}
