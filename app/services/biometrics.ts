import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export async function isBiometricsSupported(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(promptMessage = 'Desbloquear Assídua'): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const supported = await isBiometricsSupported();
    if (!supported) return true;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Usar Senha',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}
