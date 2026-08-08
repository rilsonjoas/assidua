import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useProfileStore } from '../../store/profileStore';
import { useThemeStore, ThemeMode } from '../../store/themeStore';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { logout, deleteAccount } from '../../services/auth';
import { api } from '../../services/api';

const AVATAR_ICONS: Array<React.ComponentProps<typeof MaterialCommunityIcons>['name']> = [
  'account', 'account-outline', 'account-tie', 'account-heart',
  'face-man', 'face-woman', 'baby-face-outline', 'human',
  'human-male', 'human-female', 'human-child', 'human-greeting',
];
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { mode: 'system', label: 'Sistema', icon: 'theme-light-dark' },
  { mode: 'light', label: 'Claro', icon: 'weather-sunny' },
  { mode: 'dark', label: 'Escuro', icon: 'weather-night' },
];

export default function ProfileScreen() {
  const { user, setUser } = useAuthStore();
  const { profiles, activeProfile, setProfiles, setActiveProfile } = useProfileStore();
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [avatarIcon, setAvatarIcon] = useState<React.ComponentProps<typeof MaterialCommunityIcons>['name']>('account');
  const [color, setColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/profiles').then(({ data }) => setProfiles(data));
  }, []);

  async function createProfile() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post('/profiles', { name, avatar_emoji: avatarIcon, color });
      setProfiles([...profiles, data]);
      setCreating(false);
      setName('');
      setAvatarIcon('account');
      setColor('#6366f1');
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.message ?? 'Erro ao criar perfil.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await logout();
          queryClient.clear();
          setUser(null);
        },
      },
    ]);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Excluir conta',
      'Isso vai apagar permanentemente sua conta, perfis, medicamentos e histórico de doses. Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            if (user?.has_password) {
              setDeletingAccount(true);
            } else {
              performDeleteAccount();
            }
          },
        },
      ]
    );
  }

  async function performDeleteAccount(password?: string) {
    setDeleting(true);
    try {
      await deleteAccount(password);
      queryClient.clear();
      setUser(null);
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.message ?? 'Não foi possível excluir a conta.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      {/* Card do usuário */}
      <View style={styles.userCard}>
        <View style={styles.userAvatarBox}>
          <MaterialCommunityIcons name="account-circle" size={52} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.tierBadge}>
            <MaterialCommunityIcons
              name={user?.subscription_tier === 'pro' ? 'star' : 'account-outline'}
              size={13}
              color={user?.subscription_tier === 'pro' ? '#fbbf24' : 'rgba(255,255,255,0.6)'}
            />
            <Text style={[styles.tierText, user?.subscription_tier === 'pro' && styles.tierPro]}>
              {user?.subscription_tier === 'pro' ? 'Pro' : 'Plano Gratuito'}
            </Text>
          </View>
        </View>
      </View>

      {/* Perfis */}
      <Text style={styles.sectionTitle}>Perfis de Paciente</Text>

      {profiles.length === 0 && !creating && (
        <View style={styles.emptyBox}>
          <MaterialCommunityIcons name="account-multiple-plus-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Nenhum perfil ainda.</Text>
          <Text style={styles.emptySubText}>Crie um perfil para começar a gerenciar medicamentos.</Text>
        </View>
      )}

      {profiles.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[styles.profileRow, activeProfile?.id === item.id && styles.profileRowActive]}
          onPress={() => setActiveProfile(item)}
        >
          <View style={[styles.profileIconBox, { backgroundColor: item.color }]}>
            <MaterialCommunityIcons name={(item.avatar_emoji as any) ?? 'account'} size={22} color="#fff" />
          </View>
          <Text style={styles.profileName}>{item.name}</Text>
          {activeProfile?.id === item.id && (
            <MaterialCommunityIcons name="check-circle" size={22} color={colors.brand} />
          )}
        </TouchableOpacity>
      ))}

      {creating ? (
        <View style={styles.createBox}>
          <Text style={styles.createTitle}>Novo perfil</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Nome do paciente"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <Text style={styles.createLabel}>Ícone</Text>
          <FlatList
            data={AVATAR_ICONS}
            horizontal
            keyExtractor={(e) => e}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setAvatarIcon(item)}
                style={[styles.iconBtn, avatarIcon === item && { backgroundColor: color }]}
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
          <Text style={styles.createLabel}>Cor</Text>
          <View style={styles.colorRow}>
            {COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                style={[styles.colorBtn, { backgroundColor: c }, color === c && styles.colorBtnActive]}
              />
            ))}
          </View>
          <View style={styles.createActions}>
            <TouchableOpacity onPress={() => setCreating(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={createProfile} style={styles.saveBtn} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Criar perfil'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreating(true)}>
          <MaterialCommunityIcons name="plus" size={20} color={colors.brand} />
          <Text style={styles.addBtnText}>Novo Perfil</Text>
        </TouchableOpacity>
      )}

      {/* Aparência */}
      <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Aparência</Text>
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.mode}
            style={[styles.themeBtn, themeMode === opt.mode && styles.themeBtnActive]}
            onPress={() => setThemeMode(opt.mode)}
          >
            <MaterialCommunityIcons
              name={opt.icon}
              size={20}
              color={themeMode === opt.mode ? colors.brand : colors.textMuted}
            />
            <Text style={[styles.themeBtnText, themeMode === opt.mode && styles.themeBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.error} />
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>

      {/* Excluir conta */}
      {deletingAccount ? (
        <View style={styles.deleteBox}>
          <Text style={styles.createTitle}>Confirmar exclusão</Text>
          <Text style={styles.emptySubText}>Digite sua senha para excluir permanentemente sua conta e todos os dados.</Text>
          <TextInput
            style={[styles.input, { marginTop: 12, color: colors.text }]}
            placeholder="Senha"
            placeholderTextColor={colors.textMuted}
            value={deletePassword}
            onChangeText={setDeletePassword}
            secureTextEntry
          />
          <View style={styles.createActions}>
            <TouchableOpacity
              onPress={() => { setDeletingAccount(false); setDeletePassword(''); }}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => performDeleteAccount(deletePassword)}
              style={styles.deleteConfirmBtn}
              disabled={deleting || !deletePassword}
            >
              <Text style={styles.saveBtnText}>{deleting ? 'Excluindo...' : 'Excluir permanentemente'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmDeleteAccount} disabled={deleting}>
          <MaterialCommunityIcons name="account-remove-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>{deleting ? 'Excluindo...' : 'Excluir conta'}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { padding: 16, paddingBottom: 48 },
    userCard: {
      backgroundColor: c.headerBg, borderRadius: 20, padding: 20,
      flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 28,
    },
    userAvatarBox: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    },
    userName: { fontSize: 18, fontWeight: '700', color: '#fff' },
    userEmail: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    tierText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
    tierPro: { color: '#fbbf24' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 12 },
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
    profileName: { flex: 1, fontSize: 15, color: c.text, fontWeight: '600' },
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
    saveBtnText: { color: '#fff', fontWeight: '600' },
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
  });
}
