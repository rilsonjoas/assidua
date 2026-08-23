import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as LocalAuthentication from 'expo-local-authentication';
import { isBiometricsSupported, authenticateWithBiometrics } from '../services/biometrics';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));

describe('biometrics service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna true quando o hardware suporta e há biometria cadastrada', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock<any>).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock<any>).mockResolvedValue(true);

    const supported = await isBiometricsSupported();
    expect(supported).toBe(true);
  });

  it('executa a autenticação com sucesso', async () => {
    (LocalAuthentication.hasHardwareAsync as jest.Mock<any>).mockResolvedValue(true);
    (LocalAuthentication.isEnrolledAsync as jest.Mock<any>).mockResolvedValue(true);
    (LocalAuthentication.authenticateAsync as jest.Mock<any>).mockResolvedValue({ success: true });

    const success = await authenticateWithBiometrics('Test Prompt');
    expect(success).toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Test Prompt' })
    );
  });
});
