import { useState, useMemo } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { requestMagicLink, loginWithGoogle } from '../../services/auth';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { AppText as Text } from '../../components/AppText';

const PRIVACY_URL = `${(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost/api').replace(/\/api\/?$/, '')}/privacidade`;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    try {
      const user = await loginWithGoogle();
      setUser(user);
    } catch (err: any) {
      if (!err.message?.includes('cancelado')) {
        Alert.alert(t('common.error'), err.message ?? t('register.errorGoogle'));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleRegister() {
    if (!name || !email) return;
    setLoading(true);
    try {
      await requestMagicLink(email, name);
      setSent(true);
    } catch (err: any) {
      const msg = err.response?.data?.message ?? t('register.errorGeneric');
      Alert.alert(t('common.error'), msg);
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
          <Text style={styles.title}>{t('register.sentTitle')}</Text>
          <Text style={styles.subtitle}>{t('register.sentSubtitle')}</Text>
          <TouchableOpacity
            style={styles.link}
            onPress={() => setSent(false)}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{t('register.sentBack')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          <MaterialCommunityIcons name="pill" size={48} color={colors.brand} />
        </View>
        <Text style={styles.title}>{t('register.title')}</Text>
        <Text style={styles.subtitle}>{t('register.subtitle')}</Text>

        <TextInput style={styles.input} placeholder={t('register.namePlaceholder')} placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} accessibilityLabel={t('register.nameLabel')} />
        <TextInput
          style={styles.input}
          placeholder={t('register.emailPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={t('register.emailLabel')}
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleRegister}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('register.create')}
          accessibilityState={{ busy: loading }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('register.create')}</Text>}
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
          accessibilityLabel={t('register.google')}
          accessibilityState={{ busy: googleLoading }}
        >
          {googleLoading
            ? <ActivityIndicator color={colors.text} />
            : <>
                <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
                <Text style={styles.googleButtonText}>{t('register.google')}</Text>
              </>
          }
        </TouchableOpacity>

        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkText}>{t('register.haveAccount')}</Text>
        </Link>

        <Text style={styles.privacyText}>
          {t('register.privacyPrefix')}{' '}
          <Text style={styles.privacyLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
            {t('register.privacyLink')}
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
    logoBox: { alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: c.text, marginBottom: 8 },
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
    link: { alignItems: 'center', marginTop: 8 },
    linkText: { textAlign: 'center', color: c.brand, fontSize: 15 },
    privacyText: { textAlign: 'center', color: c.textMuted, fontSize: 12, marginTop: 20, lineHeight: 18 },
    privacyLink: { color: c.brand, fontWeight: '600' },
  });
}
