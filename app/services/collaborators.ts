import { api } from './api';

// Fase 1.5, Etapa 5 — fluxo de convite/resgate de cuidador remoto.
export interface Collaborator {
  id: number;
  profile_id: number;
  invited_by_user_id: number;
  user_id: number | null;
  role: string;
  invite_code: string | null;
  expires_at: string | null;
  accepted_at: string | null;
  user: { id: number; name: string; email: string } | null;
}

export async function createInvite(profileId: number): Promise<Collaborator> {
  const { data } = await api.post(`/profiles/${profileId}/collaborators`);
  return data;
}

export async function listCollaborators(profileId: number): Promise<Collaborator[]> {
  const { data } = await api.get(`/profiles/${profileId}/collaborators`);
  return data;
}

export async function revokeCollaborator(profileId: number, collaboratorId: number): Promise<void> {
  await api.delete(`/profiles/${profileId}/collaborators/${collaboratorId}`);
}

export async function acceptInvite(code: string): Promise<{ id: number; name: string; color: string; avatar_emoji: string }> {
  const { data } = await api.post(`/invites/${code}/accept`);
  return data;
}
