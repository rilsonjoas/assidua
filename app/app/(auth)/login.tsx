import { useState, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { requestMagicLink, loginWithGoogle } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { AppText as Text } from '../../components/AppText';
import { useAlertDialog } from '../../hooks/useAlertDialog';

import { isValidEmail } from '../../lib/schemas';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showAlert, alertDialog } = useAlertDialog();

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    try {
      const user = await loginWithGoogle();
      setUser(user);
    } catch (err: any) {
      if (!err.message?.includes('cancelado')) {
        showAlert(t('common.error'), err.message ?? t('login.errorGeneric'));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSendLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      showAlert(t('common.error'), t('login.errorEmptyEmail'));
      return;
    }
    if (!isValidEmail(trimmed)) {
      showAlert(t('common.error'), t('login.errorInvalidEmail'));
      return;
    }
    setLoading(true);
    try {
      await requestMagicLink(trimmed);
      setSent(true);
    } catch (err: any) {
      // Mostra a mensagem real do backend (ex.: "Não encontramos uma
      // conta com esse e-mail") em vez de genérico — era invisível na
      // web até o fix do Alert no-op.
      showAlert(t('common.error'), err.response?.data?.message ?? t('login.errorSend'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.logoBox}>
            <MaterialCommunityIcons name="email-check-outline" size={48} color={colors.brand} />
          </View>
          <Text style={styles.title}>{t('login.sentTitle')}</Text>
          <Text style={styles.subtitle}>{t('login.sentSubtitle')}</Text>
          <TouchableOpacity
            style={styles.link}
            onPress={() => setSent(false)}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{t('login.sentBack')}</Text>
          </TouchableOpacity>
        </View>
        {alertDialog}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoBox}>
          {/* Marca real (coração+relógio), não o ícone genérico de pílula —
              é a primeira tela que qualquer pessoa vê, e "Assídua" sozinho
              não é autoexplicativo como "Meus Remédios" era (2026-08-22).
              Achado do Rilson (mesmo dia): `icon.png` tem fundo branco
              opaco, não transparente — vira um quadrado feio no escuro.
              Tema-aware: roxa transparente no claro, branca no escuro. */}
          <Image
            source={isDark ? require('../../assets/logo-mark-white.png') : require('../../assets/logo-mark.png')}
            style={styles.logoImage}
            accessible={false}
            importantForAccessibility="no"
          />
        </View>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('login.emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={t('login.emailLabel')}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleSendLink}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('login.enter')}
          accessibilityState={{ busy: loading }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('login.enter')}</Text>}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('common.or')}</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleLogin}
          disabled={googleLoading}
          accessibilityRole="button"
          accessibilityLabel={t('login.google')}
          accessibilityState={{ busy: googleLoading }}
        >
          {googleLoading
            ? <ActivityIndicator color={colors.text} />
            : <>
                <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
                <Text style={styles.googleButtonText}>{t('login.google')}</Text>
              </>
          }
        </TouchableOpacity>

        <Link href="/(auth)/register" style={styles.link}>
          <Text style={styles.linkText}>{t('login.noAccount')}</Text>
        </Link>
      </View>
      {alertDialog}
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    logoBox: { alignItems: 'center', marginBottom: 12 },
    logoImage: { width: 64, height: 64 },
    title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: c.text },
    subtitle: { fontSize: 16, textAlign: 'center', color: c.textSecondary, marginBottom: 32 },
    input: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 12, color: c.text,
    },
    button: {
      backgroundColor: c.brand, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 8, marginBottom: 16,
    },
    buttonText: { color: c.onBrand, fontSize: 16, fontWeight: '600' },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
    dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
    dividerText: { color: c.textMuted, fontSize: 13 },
    googleButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
      borderRadius: 12, padding: 14, marginBottom: 16,
    },
    googleButtonText: { fontSize: 15, fontWeight: '600', color: c.text },
    link: { alignItems: 'center', marginTop: 20 },
    linkText: { textAlign: 'center', color: c.brand, fontSize: 15 },
  });
}
