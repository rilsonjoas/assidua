import { useState, useEffect } from 'react';
import { AppState, AppStateStatus, View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { AppText as Text } from './AppText';

export function PrivacyBlur() {
  const { colors } = useTheme();
  const [isBlurred, setIsBlurred] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const blurred = nextAppState === 'background' || nextAppState === 'inactive';
      setIsBlurred(blurred);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!isBlurred) return null;

  return (
    <View
      style={[styles.overlay, { backgroundColor: colors.background }]}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
      testID="privacy-blur-overlay"
    >
      <MaterialCommunityIcons name="shield-lock" size={64} color={colors.brand} />
      <Text style={[styles.title, { color: colors.text }]}>Assídua</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 16,
  },
});
