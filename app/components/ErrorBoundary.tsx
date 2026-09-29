import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';
import { useTheme } from '../hooks/useTheme';
import { lightColors, ThemeColors } from '../constants/theme';
import { AppText as Text } from './AppText';
import { rounded, spacing, type } from '../constants/tokens';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  let colors: ThemeColors = lightColors;
  try {
    const theme = useTheme();
    if (theme?.colors) colors = theme.colors;
  } catch {}

  let t = (key: string) => {
    if (key === 'errorBoundary.title') return 'Ops! Algo deu errado';
    if (key === 'errorBoundary.subtitle') return 'Ocorreu um erro inesperado na exibição desta tela.';
    if (key === 'errorBoundary.retry') return 'Tentar novamente';
    return key;
  };

  try {
    const translation = useTranslation();
    if (translation?.t) t = translation.t;
  } catch {}

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} accessibilityRole="alert">
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={56} color={colors.error} />
        <Text style={[styles.title, { color: colors.text }]}>
          {t('errorBoundary.title')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('errorBoundary.subtitle')}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.brand }]}
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel={t('errorBoundary.retry')}
        >
          <Text style={[styles.buttonText, { color: colors.onBrand }]}>{t('errorBoundary.retry')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (Platform.OS !== 'web') {
      try {
        Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
      } catch {}
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: rounded.lg,
    padding: spacing.xxl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: type.section,
    fontWeight: '700',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: type.caption,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
    textAlign: 'center',
    lineHeight: 20,
  },
  // minHeight 48 (WCAG AAA, auditoria de toque mínimo 2026-09-08).
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: type.label,
    fontWeight: '600',
  },
});
