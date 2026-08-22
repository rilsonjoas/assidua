import { useState, useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Share,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useThemeStore, ThemeMode } from '../../store/themeStore';
import { useFontScaleStore, FontScaleMode } from '../../store/fontScaleStore';
import { useTheme } from '../../hooks/useTheme';
import { useLanguage } from '../../hooks/useLanguage';
import { ThemeColors } from '../../constants/theme';
import { logout, deleteAccount } from '../../services/auth';
import { createInvite, acceptInvite } from '../../services/collaborators';
import { api } from '../../services/api';
import { getDeviceTimezone, SupportedLanguage } from '../../services/device';
import { LanguageMode } from '../../store/languageStore';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AlertDialog } from '../../components/AlertDialog';
import { AppText as Text } from '../../components/AppText';

const AVATAR_ICONS: Array<React.ComponentProps<typeof MaterialCommunityIcons>['name']> = [
  'account', 'account-outline', 'account-tie', 'account-heart',
  'face-man', 'face-woman', 'baby-face-outline', 'human',
  'human-male', 'human-female', 'human-child', 'human-greeting',
];
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

const THEME_ICONS: Record<ThemeMode, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  system: 'theme-light-dark',
  light: 'weather-sunny',
  dark: 'weather-night',
};

// Mesma UI do seletor de tema, reaproveitada pro idioma (2026-08-10).
const LANGUAGE_ICON: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'translate';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const { profiles, activeProfile, setProfiles, setActiveProfile } = useProfileStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { mode: languageMode, setLanguage } = useLanguage();
  const { mode: fontScaleMode, setMode: setFontScaleMode } = useFontScaleStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { mode: 'system', label: t('profile.themeSystem'), icon: THEME_ICONS.system },
    { mode: 'light', label: t('profile.themeLight'), icon: THEME_ICONS.light },
    { mode: 'dark', label: t('profile.themeDark'), icon: THEME_ICONS.dark },
  ];

  // Achado real (2026-08-14): "Extra Grande" (12 caracteres) numa
  // coluna de 3 com flex:1 quebra sozinho — mesmo problema do seletor
  // de idioma já corrigido antes (ver `languageRow`), agora na própria
  // opção que deixa a fonte maior. Rótulo visível curto
  // (`shortLabel`), rótulo completo só no leitor de tela
  // (`accessibilityLabel`, via `label`).
  const FONT_SCALE_OPTIONS: { mode: FontScaleMode; label: string; shortLabel: string; previewSize: number }[] = [
    { mode: 'normal', label: t('profile.fontSizeNormal'), shortLabel: t('profile.fontSizeNormal'), previewSize: 16 },
    { mode: 'large', label: t('profile.fontSizeLarge'), shortLabel: t('profile.fontSizeLarge'), previewSize: 20 },
    { mode: 'extraLarge', label: t('profile.fontSizeExtraLarge'), shortLabel: t('profile.fontSizeExtraLargeShort'), previewSize: 24 },
  ];

  const LANGUAGE_OPTIONS: { mode: LanguageMode; label: string }[] = [
    { mode: 'system', label: t('profile.languageSystem') },
    { mode: 'pt', label: t('profile.languagePt') },
    { mode: 'en', label: t('profile.languageEn') },
    { mode: 'es', label: t('profile.languageEs') },
  ];
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [avatarIcon, setAvatarIcon] = useState<React.ComponentProps<typeof MaterialCommunityIcons>['name']>('account');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Confirmação de sair/excluir (2026-08-13) — Alert.alert nativo
  // destoava do resto do app (achado real testando no dispositivo).
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Achado real (2026-08-14): a mesma reclamação valia pra avisos de
  // uma mensagem só, não só pras confirmações sim/não — `Alert.alert`
  // nativo destoava igual. Um estado genérico cobre os 6 usos desta
  // tela em vez de 6 booleans repetidos.
  const [alertInfo, setAlertInfo] = useState<{ title: string; message: string } | null>(null);
  function showAlert(title: string, message: string) {
    setAlertInfo({ title, message });
  }
  const [invitingProfileId, setInvitingProfileId] = useState<number | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemingLoading, setRedeemingLoading] = useState(false);

  function refetchProfiles() {
    api.get('/profiles').then(({ data }) => setProfiles(data));
  }

  useEffect(() => {
    refetchProfiles();
  }, []);

  // Fase 1.5, Etapa 5 — dono gera o convite e compartilha o código por
  // fora do app (WhatsApp, SMS, o que for — Share nativo cobre isso sem
  // precisar de integração própria).
  async function handleInvite(profileId: number) {
    setInvitingProfileId(profileId);
    try {
      const { invite_code } = await createInvite(profileId);
      await Share.share({
        message: t('profile.inviteMessage', { code: invite_code }),
      });
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('profile.errorInvite'));
    } finally {
      setInvitingProfileId(null);
    }
  }

  async function handleRedeem() {
    if (!redeemCode.trim()) return;
    setRedeemingLoading(true);
    try {
      await acceptInvite(redeemCode.trim().toUpperCase());
      refetchProfiles();
      setRedeeming(false);
      setRedeemCode('');
      showAlert(t('profile.redeemSuccessTitle'), t('profile.redeemSuccessText'));
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('profile.errorRedeem'));
    } finally {
      setRedeemingLoading(false);
    }
  }

  async function createProfile() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/profiles', {
        name,
        avatar_emoji: avatarIcon,
        color,
        timezone: getDeviceTimezone(),
      });
      setProfiles([...profiles, data]);
      setCreating(false);
      setName('');
      setAvatarIcon('account');
      setColor('#6366f1');
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('profile.errorCreateProfile'));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      queryClient.clear();
      setUser(null);
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  }

  function confirmDeleteAccount() {
    setConfirmingDelete(false);
    if (user?.has_password) {
      setDeletingAccount(true);
    } else {
      performDeleteAccount();
    }
  }

  async function performDeleteAccount(password?: string) {
    setDeleting(true);
    try {
      await deleteAccount(password);
      queryClient.clear();
      setUser(null);
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.message ?? t('profile.errorDelete'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    {/* Achado real de uso (2026-08-14): colar código de convite, criar
        perfil e a senha pra excluir conta ficavam cobertos pelo teclado
        — mesmo bug do formulário de medicamento, aqui sem o tratamento. */}
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
      {/* Card do usuário */}
      <View style={styles.userCard}>
        {/* Marca (2026-08-21) — feedback do Rilson: "quem não aparece não
            é lembrado". A tela de Perfis não tinha NENHUM ponto de marca;
            a silhueta branca no canto do card colorido ancora o logo no
            primeiro lugar onde o olho pousa, sem virar poluição. */}
        <Image
          source={require('../../assets/android-icon-monochrome.png')}
          style={styles.cardBrandMark}
          accessible={false}
          importantForAccessibility="no"
        />
        <View style={styles.userAvatarBox}>
          <MaterialCommunityIcons name="account-circle" size={52} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <TouchableOpacity
            style={styles.tierBadge}
            onPress={() => router.push('/pro')}
            accessibilityRole="button"
            accessibilityLabel={t('pro.badgeLabel', {
              tier: user?.subscription_tier === 'pro' ? t('profile.pro') : t('profile.free'),
            })}
          >
            <MaterialCommunityIcons
              name={user?.subscription_tier === 'pro' ? 'star' : 'account-outline'}
              size={13}
              color={user?.subscription_tier === 'pro' ? '#fbbf24' : 'rgba(255,255,255,0.6)'}
            />
            <Text style={[styles.tierText, user?.subscription_tier === 'pro' && styles.tierPro]}>
              {user?.subscription_tier === 'pro' ? t('profile.pro') : t('profile.free')}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={13} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Perfis */}
      <Text style={styles.sectionTitle}>{t('profile.patientProfiles')}</Text>
      {/* Achado real (2026-08-14): a tela nunca explicava o que é um
          perfil nem pra que serve convidar alguém — só tinha o botão
          "Tenho um código" sem contexto de quando/por que usar. */}
      <Text style={styles.sectionHint}>{t('profile.patientProfilesHint')}</Text>

      {profiles.length === 0 && !creating && (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="account-multiple-plus-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('profile.noProfilesYet')}</Text>
          <Text style={styles.emptySubText}>{t('profile.createToStart')}</Text>
        </View>
      )}

      {profiles.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.profileRow, activeProfile?.id === item.id && styles.profileRowActive]}
          onPress={() => setActiveProfile(item)}
          accessibilityRole="button"
          accessibilityLabel={item.is_owner === false ? t('profile.profileLabelShared', { name: item.name }) : t('profile.profileLabel', { name: item.name })}
          accessibilityState={{ selected: activeProfile?.id === item.id }}
        >
          <View style={[styles.profileIconBox, { backgroundColor: item.color }]}>
            <MaterialCommunityIcons name={(item.avatar_emoji as any) ?? 'account'} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{item.name}</Text>
            {item.is_owner === false && (
              <View style={styles.sharedBadge}>
                <MaterialCommunityIcons name="account-heart-outline" size={12} color={colors.brand} />
                <Text style={styles.sharedBadgeText}>{t('profile.sharedBadge')}</Text>
              </View>
            )}
          </View>
          {item.is_owner !== false && (
            <TouchableOpacity
              testID={`invite-btn-${item.id}`}
              onPress={() => handleInvite(item.id)}
              disabled={invitingProfileId === item.id}
              style={styles.inviteBtn}
              accessibilityRole="button"
              accessibilityLabel={t('profile.inviteLabel', { name: item.name })}
            >
              <MaterialCommunityIcons
                name="account-plus-outline"
                size={18}
                color={invitingProfileId === item.id ? colors.textMuted : colors.brand}
              />
            </TouchableOpacity>
          )}
          {activeProfile?.id === item.id && (
            <MaterialCommunityIcons name="check-circle" size={22} color={colors.brand} />
          )}
        </TouchableOpacity>
      ))}

      {redeeming ? (
        <View style={styles.createBox}>
          <Text style={styles.createTitle}>{t('profile.haveCode')}</Text>
          <Text style={styles.emptySubText}>
            {t('profile.pasteCode')}
          </Text>
          <TextInput
            style={[styles.input, { marginTop: 12, color: colors.text }]}
            placeholder={t('profile.codePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={redeemCode}
            onChangeText={setRedeemCode}
            autoCapitalize="characters"
            accessibilityLabel={t('profile.codeLabel')}
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => { setRedeeming(false); setRedeemCode(''); }}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRedeem}
              style={styles.saveBtn}
              disabled={redeemingLoading}
              accessibilityRole="button"
              accessibilityLabel={t('profile.enter')}
              accessibilityState={{ busy: redeemingLoading }}
            >
              <Text style={styles.saveBtnText}>{redeemingLoading ? t('profile.entering') : t('profile.enter')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setRedeeming(true)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.haveCode')}
        >
          <MaterialCommunityIcons name="account-heart-outline" size={18} color={colors.brand} />
          <Text style={styles.addBtnText}>{t('profile.haveCode')}</Text>
        </TouchableOpacity>
      )}

      {creating ? (
        <View style={styles.createBox}>
          <Text style={styles.createTitle}>{t('profile.newProfileTitle')}</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder={t('profile.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            accessibilityLabel={t('profile.nameLabel')}
          />
          <Text style={styles.createLabel}>{t('profile.iconLabel')}</Text>
          <FlatList
            data={AVATAR_ICONS}
            horizontal
            keyExtractor={(e) => e}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setAvatarIcon(item)}
                style={[styles.iconBtn, avatarIcon === item && { backgroundColor: color }]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.iconOptionLabel', { icon: item.replace(/-/g, ' ') })}
                accessibilityState={{ selected: avatarIcon === item }}
              >
                <MaterialCommunityIcons
                  name={item}
                  size={24}
                  color={avatarIcon === item ? '#fff' : colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            style={styles.iconRow}
          />
          <Text style={styles.createLabel}>{t('profile.colorLabel')}</Text>
          <View style={styles.colorRow}>
            {COLORS.map((c, i) => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[styles.colorBtn, { backgroundColor: c }, color === c && styles.colorBtnActive]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.colorOptionLabel', { index: i + 1 })}
                accessibilityState={{ selected: color === c }}
              />
            ))}
          </View>
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => setCreating(false)}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={createProfile}
              style={styles.saveBtn}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('profile.createProfileLabel')}
              accessibilityState={{ busy: saving }}
            >
              <Text style={styles.saveBtnText}>{saving ? t('profile.saving') : t('profile.createProfileLabel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setCreating(true)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.newProfile')}
        >
          <MaterialCommunityIcons name="plus" size={20} color={colors.brand} />
          <Text style={styles.addBtnText}>{t('profile.newProfile')}</Text>
        </TouchableOpacity>
      )}

      {/* Aparência */}
      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>{t('profile.appearance')}</Text>
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.mode}
            style={[styles.themeBtn, themeMode === opt.mode && styles.themeBtnActive]}
            onPress={() => setThemeMode(opt.mode)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.themeLabel', { label: opt.label })}
            accessibilityState={{ selected: themeMode === opt.mode }}
          >
            <MaterialCommunityIcons
              name={opt.icon}
              size={20}
              color={themeMode === opt.mode ? colors.brand : colors.textMuted}
            />
            <Text
              style={[styles.themeBtnText, themeMode === opt.mode && styles.themeBtnTextActive]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Idioma (2026-08-10) — achado real testando no dispositivo
          (2026-08-13): 4 opções espremidas numa linha só (mesmo layout
          flex:1 do tema, que só tem 3) deixava o ícone colado na borda
          e "Del dispositivo"/"Device default" quebrava em 2 linhas.
          Grade 2x2 dá espaço de sobra; rótulo "Sistema"/"System"
          também encurtado (igual ao do tema, mesmo padrão). */}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t('profile.language')}</Text>
      <View style={styles.languageRow}>
        {LANGUAGE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.mode}
            style={[styles.languageBtn, languageMode === opt.mode && styles.themeBtnActive]}
            onPress={() => setLanguage(opt.mode)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.languageLabel', { label: opt.label })}
            accessibilityState={{ selected: languageMode === opt.mode }}
          >
            <MaterialCommunityIcons
              name={LANGUAGE_ICON}
              size={20}
              color={languageMode === opt.mode ? colors.brand : colors.textMuted}
            />
            <Text
              style={[styles.themeBtnText, languageMode === opt.mode && styles.themeBtnTextActive]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tamanho da fonte (2026-08-14) — item #1 de acessibilidade pro
          público real do app (idoso, cuidador com baixa familiaridade
          digital), feito só depois da auditoria de responsividade
          (2026-08-13) confirmar margem de sobra até 1.3x sem quebrar
          layout. Ícone em 3 tamanhos crescentes serve de prévia visual
          — mesma ideia de "AAA" que seletor de fonte de SO usa. */}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t('profile.fontSize')}</Text>
      <View style={styles.themeRow}>
        {FONT_SCALE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.mode}
            style={[styles.themeBtn, fontScaleMode === opt.mode && styles.themeBtnActive]}
            onPress={() => setFontScaleMode(opt.mode)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.fontSizeLabel', { label: opt.label })}
            accessibilityState={{ selected: fontScaleMode === opt.mode }}
          >
            <MaterialCommunityIcons
              name="format-size"
              size={opt.previewSize}
              color={fontScaleMode === opt.mode ? colors.brand : colors.textMuted}
            />
            <Text
              style={[styles.themeBtnText, fontScaleMode === opt.mode && styles.themeBtnTextActive]}
              numberOfLines={1}
            >
              {opt.shortLabel}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ajuda (2026-08-14) — pergunta direta do Rilson: "não tem como
          facilitar pra novos usuários com um guia?". O onboarding só
          aparece uma vez; isto fica sempre acessível, pra quem
          esqueceu o que algo significa ou nunca chegou a ver o
          onboarding (porque foi o cuidador quem configurou). */}
      <TouchableOpacity
        style={styles.helpBtn}
        onPress={() => router.push('/help')}
        accessibilityRole="button"
        accessibilityLabel={t('help.headerTitle')}
      >
        <MaterialCommunityIcons name="help-circle-outline" size={20} color={colors.textSecondary} />
        <Text style={styles.helpBtnText}>{t('help.headerTitle')}</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Logout */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => setConfirmingLogout(true)}
        accessibilityRole="button"
        accessibilityLabel={t('profile.logout')}
      >
        <MaterialCommunityIcons name="logout" size={18} color={colors.error} />
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </TouchableOpacity>

      {/* Excluir conta */}
      {deletingAccount ? (
        <View style={styles.deleteBox}>
          <Text style={styles.createTitle}>{t('profile.deleteConfirmTitle2')}</Text>
          <Text style={styles.emptySubText}>{t('profile.deletePasswordPrompt')}</Text>
          <TextInput
            style={[styles.input, { marginTop: 12, color: colors.text }]}
            placeholder={t('profile.passwordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={deletePassword}
            onChangeText={setDeletePassword}
            secureTextEntry
            accessibilityLabel={t('profile.passwordLabel')}
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => { setDeletingAccount(false); setDeletePassword(''); }}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => performDeleteAccount(deletePassword)}
              style={styles.deleteConfirmBtn}
              disabled={deleting || !deletePassword}
              accessibilityRole="button"
              accessibilityLabel={t('profile.deletePermanently')}
              accessibilityState={{ busy: deleting }}
            >
              <Text style={styles.saveBtnText}>{deleting ? t('profile.deleting') : t('profile.deletePermanently')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => setConfirmingDelete(true)}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t('profile.deleteAccount')}
        >
          <MaterialCommunityIcons name="account-remove-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>{deleting ? t('profile.deleting') : t('profile.deleteAccount')}</Text>
        </TouchableOpacity>
      )}

      {/* Rodapé de marca (2026-08-21) — padrão comum em apps: assinatura
          discreta no fim do scroll. O tintColor adapta a silhueta ao tema
          (o PNG é branco; tingido com textMuted funciona claro/escuro).
          Versão do app junto — ajuda muito em report de bug. */}
      <View style={styles.brandFooter}>
        <Image
          source={require('../../assets/android-icon-monochrome.png')}
          style={[styles.brandFooterLogo, { tintColor: colors.textMuted }]}
          accessible={false}
          importantForAccessibility="no"
        />
        <Text style={styles.brandFooterName}>{t('login.title')}</Text>
        {!!Constants.expoConfig?.version && (
          <Text style={styles.brandFooterVersion}>
            {t('profile.version', { version: Constants.expoConfig.version })}
          </Text>
        )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>

    <ConfirmDialog
      visible={confirmingLogout}
      title={t('profile.logoutConfirmTitle')}
      message={t('profile.logoutConfirmMessage')}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('profile.logoutShort')}
      destructive
      busy={loggingOut}
      onCancel={() => setConfirmingLogout(false)}
      onConfirm={handleLogout}
    />
    <ConfirmDialog
      visible={confirmingDelete}
      title={t('profile.deleteConfirmTitle')}
      message={t('profile.deleteConfirmMessage')}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('profile.deleteContinue')}
      destructive
      onCancel={() => setConfirmingDelete(false)}
      onConfirm={confirmDeleteAccount}
    />
    <AlertDialog
      visible={!!alertInfo}
      title={alertInfo?.title ?? ''}
      message={alertInfo?.message ?? ''}
      okLabel="OK"
      onDismiss={() => setAlertInfo(null)}
    />
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: 16, paddingBottom: 48 },
    userCard: {
      backgroundColor: c.headerBg, borderRadius: 20, padding: 20,
      flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 28,
      overflow: 'hidden',
    },
    cardBrandMark: {
      position: 'absolute', top: -26, right: -26, width: 110, height: 110, opacity: 0.14,
    },
    userAvatarBox: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    },
    // Branco literal de propósito (não `c.onBrand`) — este texto fica
    // sobre `userCard`/`headerBg`, não sobre `c.brand`; `headerBg` já
    // tem contraste bom com branco nos dois temas (ver auditoria em
    // constants/theme.ts).
    userName: { fontSize: 18, fontWeight: '700', color: '#fff' },
    userEmail: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    tierText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
    tierPro: { color: '#fbbf24' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 4 },
    sectionHint: { fontSize: 13, color: c.textSecondary, lineHeight: 18, marginBottom: 12 },
    emptyBox: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyText: { fontSize: 15, fontWeight: '600', color: c.textMuted },
    emptySubText: { fontSize: 13, color: c.textMuted, textAlign: 'center' },
    profileRow: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface,
      borderRadius: 14, padding: 14, marginBottom: 8, gap: 14,
      elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    },
    profileRowActive: { borderWidth: 2, borderColor: c.brand },
    profileIconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    profileName: { fontSize: 15, color: c.text, fontWeight: '600' },
    sharedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    sharedBadgeText: { fontSize: 11, color: c.brand, fontWeight: '600' },
    inviteBtn: { padding: 8, marginRight: 4 },
    createBox: { backgroundColor: c.surface, borderRadius: 16, padding: 16, marginBottom: 12 },
    createTitle: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 14 },
    createLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 8, marginTop: 4 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      padding: 12, fontSize: 16, marginBottom: 4, backgroundColor: c.background,
    },
    iconRow: { marginBottom: 4 },
    iconBtn: { padding: 8, marginRight: 6, borderRadius: 10, backgroundColor: c.surfaceSecondary },
    colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    colorBtn: { width: 30, height: 30, borderRadius: 15 },
    colorBtnActive: { borderWidth: 3, borderColor: c.text, transform: [{ scale: 1.15 }] },
    createActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    cancelText: { color: c.textSecondary, fontWeight: '600' },
    saveBtn: { flex: 1, backgroundColor: c.brand, padding: 13, borderRadius: 10, alignItems: 'center' },
    saveBtnText: { color: c.onBrand, fontWeight: '600' },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      borderWidth: 1.5, borderColor: c.brand, borderStyle: 'dashed', marginBottom: 16,
    },
    addBtnText: { color: c.brand, fontWeight: '600', fontSize: 15 },
    themeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    themeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      borderWidth: 1.5, borderColor: c.border,
    },
    themeBtnActive: { borderColor: c.brand, backgroundColor: c.brandSubtle },
    themeBtnText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    themeBtnTextActive: { color: c.brand },
    // Grade 2x2 (2026-08-13) — 4 opções de idioma cabiam apertadas numa
    // linha só; largura fixa em vez de flex:1 dá espaço de sobra e
    // deixa quebrar em 2 linhas quando tem 4 itens.
    languageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    languageBtn: {
      width: '48%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.surface, borderRadius: 12, padding: 12,
      borderWidth: 1.5, borderColor: c.border,
    },
    helpBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginTop: 20,
      borderWidth: 1, borderColor: c.border,
    },
    helpBtnText: { flex: 1, color: c.text, fontWeight: '600', fontSize: 15 },
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, padding: 14, marginTop: 8,
    },
    logoutText: { color: c.error, fontWeight: '600', fontSize: 15 },
    deleteBox: {
      backgroundColor: c.surface, borderRadius: 16, padding: 16, marginTop: 8,
      borderWidth: 1, borderColor: c.error,
    },
    deleteConfirmBtn: {
      flex: 1, backgroundColor: c.error, padding: 13, borderRadius: 10, alignItems: 'center',
    },
    brandFooter: { alignItems: 'center', marginTop: 36, gap: 6 },
    // Mesma silhueta branca do header/card; tintColor (no JSX) a adapta
    // ao tema aqui, onde o fundo é claro/escuro variável.
    brandFooterLogo: { width: 30, height: 30, opacity: 0.55 },
    brandFooterName: { fontSize: 14, fontWeight: '700', color: c.textMuted, letterSpacing: 0.3 },
    brandFooterVersion: { fontSize: 11, color: c.textMuted, opacity: 0.8 },
  });
}
