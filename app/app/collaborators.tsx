import { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Share } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { useIsWideScreen } from '../hooks/useBreakpoint';
import { ThemeColors } from '../constants/theme';
import { useProfileStore } from '../store/profileStore';
import { AppText as Text } from '../components/AppText';
import { SkeletonList } from '../components/Skeleton';
import { useAlertDialog } from '../hooks/useAlertDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { listCollaborators, createInvite, revokeCollaborator, Collaborator } from '../services/collaborators';

// "Quem tem acesso" (2026-09-08, maior achado da revisão de UI/UX do
// Rilson) — `listCollaborators`/`revokeCollaborator` já existiam no
// serviço, chamando endpoints reais do Laravel que já funcionavam, mas
// nenhuma tela do app chamava essas funções: quem aceitava um convite
// ficava com acesso permanente, sem o dono do perfil ter como ver quem
// é ou tirar esse acesso depois. Esta tela fecha esse ciclo: lista quem
// tem/está com convite pendente, deixa revogar, e o convite em si só
// sai daqui agora (antes era imediato ao tocar num ícone em Perfil,
// sem pausa nem explicação do que a pessoa convidada vai poder fazer).
export default function CollaboratorsScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const id = Number(profileId);
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isWide = useIsWideScreen();
  const profile = useProfileStore((s) => s.profiles.find((p) => p.id === id));
  const queryClient = useQueryClient();
  const { showAlert, alertDialog } = useAlertDialog();
  const [inviting, setInviting] = useState(false);
  const [confirmingInvite, setConfirmingInvite] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Collaborator | null>(null);
  const [revoking, setRevoking] = useState(false);

  const { data: collaborators = [], isLoading } = useQuery({
    queryKey: ['collaborators', id],
    queryFn: () => listCollaborators(id),
    enabled: !!id,
  });

  async function handleInvite() {
    setConfirmingInvite(false);
    setInviting(true);
    try {
      const { invite_code } = await createInvite(id);
      await queryClient.invalidateQueries({ queryKey: ['collaborators', id] });
      await Share.share({ message: t('profile.inviteMessage', { code: invite_code }) });
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('profile.errorInvite'));
    } finally {
      setInviting(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeCollaborator(id, revokeTarget.id);
      await queryClient.invalidateQueries({ queryKey: ['collaborators', id] });
      setRevokeTarget(null);
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('profile.errorRevoke'));
    } finally {
      setRevoking(false);
    }
  }

  const revokingPending = !!revokeTarget && !revokeTarget.accepted_at;

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.inner, isWide && styles.innerWide]}>
      <Text style={styles.subtitle}>
        {profile ? t('profile.collaboratorsSubtitle', { name: profile.name }) : ''}
      </Text>

      {isLoading ? (
        <SkeletonList lines={2} />
      ) : collaborators.length === 0 ? (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="account-heart-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('profile.collaboratorsEmpty')}</Text>
          <Text style={styles.emptySubText}>{t('profile.collaboratorsEmptyHint')}</Text>
        </View>
      ) : (
        collaborators.map((c) => {
          const pending = !c.accepted_at;
          const displayName = c.user?.name ?? c.user?.email ?? '';
          return (
            <View key={c.id} style={styles.row}>
              <View style={styles.rowIconBox}>
                <MaterialCommunityIcons
                  name={pending ? 'clock-outline' : 'account-check-outline'}
                  size={20}
                  color={pending ? colors.textMuted : colors.brand}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>
                  {pending ? t('profile.collaboratorPending') : displayName}
                </Text>
                <Text style={styles.rowHint}>
                  {pending ? t('profile.collaboratorPendingHint') : (c.user?.email ?? '')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setRevokeTarget(c)}
                style={styles.revokeBtn}
                accessibilityRole="button"
                accessibilityLabel={pending ? t('profile.cancelInviteLabel') : t('profile.revokeLabel', { name: displayName })}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={16} color={colors.error} />
                <Text style={styles.revokeBtnText}>{pending ? t('profile.cancelInvite') : t('profile.revoke')}</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <TouchableOpacity
        style={styles.inviteBtn}
        onPress={() => setConfirmingInvite(true)}
        disabled={inviting}
        accessibilityRole="button"
        accessibilityLabel={t('profile.inviteNewCaregiver')}
        accessibilityState={{ busy: inviting }}
      >
        {inviting ? <ActivityIndicator color={colors.onBrand} /> : (
          <>
            <MaterialCommunityIcons name="account-plus-outline" size={18} color={colors.onBrand} />
            <Text style={styles.inviteBtnText}>{t('profile.inviteNewCaregiver')}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Pausa antes de convidar (2026-09-08, item 2 da revisão) — antes
          era instantâneo (tocar já criava o código e abria o
          compartilhamento). Agora explica o que a pessoa convidada vai
          poder fazer (e o que não vai) antes de gerar/compartilhar
          qualquer coisa. */}
      <ConfirmDialog
        visible={confirmingInvite}
        title={t('profile.inviteConfirmTitle', { name: profile?.name ?? '' })}
        message={t('profile.inviteConfirmMessage')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('profile.inviteConfirmAction')}
        onCancel={() => setConfirmingInvite(false)}
        onConfirm={handleInvite}
      />
      <ConfirmDialog
        visible={!!revokeTarget}
        title={revokingPending ? t('profile.cancelInviteConfirmTitle') : t('profile.revokeConfirmTitle')}
        message={
          revokingPending
            ? t('profile.cancelInviteConfirmMessage')
            : t('profile.revokeConfirmMessage', { name: revokeTarget?.user?.name ?? '' })
        }
        cancelLabel={t('common.cancel')}
        confirmLabel={revokingPending ? t('profile.cancelInviteConfirmAction') : t('profile.revokeConfirmAction')}
        destructive
        busy={revoking}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={confirmRevoke}
      />
      {alertDialog}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: 20, paddingBottom: 48 },
    innerWide: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 48 },
    subtitle: { fontSize: 14, color: c.textSecondary, lineHeight: 20, marginBottom: 20 },
    emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 16 },
    emptyText: { fontSize: 16, fontWeight: '700', color: c.textSecondary, textAlign: 'center' },
    emptySubText: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
    },
    rowIconBox: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
    },
    rowName: { fontSize: 15, fontWeight: '600', color: c.text },
    rowHint: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    revokeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, minHeight: 44, justifyContent: 'center' },
    revokeBtnText: { fontSize: 12, fontWeight: '600', color: c.error },
    inviteBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: c.brand, borderRadius: 12, paddingVertical: 14, marginTop: 12, minHeight: 48,
    },
    inviteBtnText: { color: c.onBrand, fontWeight: '700', fontSize: 15 },
  });
}
