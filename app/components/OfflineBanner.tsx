import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { AppText as Text } from './AppText';
import { spacing, type } from '../constants/tokens';

export function OfflineBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.warning }]} accessibilityRole="alert">
      <MaterialCommunityIcons name="wifi-off" size={16} color="#fff" />
      <Text style={styles.text}>{t('common.offlineBanner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  text: {
    color: '#fff',
    fontSize: type.microTight,
    fontWeight: '600',
    textAlign: 'center',
  },
});
