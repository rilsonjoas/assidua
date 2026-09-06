import { describe, it, expect, jest } from '@jest/globals';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { exportConsultationReportPdf } from '../lib/reportPdf';

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

describe('exportConsultationReportPdf', () => {
  it('gera o PDF e aciona o diálogo de compartilhamento', async () => {
    (Print.printToFileAsync as jest.Mock<any>).mockResolvedValue({ uri: 'file://report.pdf' });
    (Sharing.isAvailableAsync as jest.Mock<any>).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock<any>).mockResolvedValue(undefined);

    const result = await exportConsultationReportPdf({
      profileName: 'Maria',
      periodDays: 30,
      percentage: 95,
      taken: 28,
      due: 30,
      missed: [],
      medications: [{ name: 'Dipirona', dosage: '500', unit: 'mg' }],
    });

    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://report.pdf', expect.anything());
    expect(result).toBe('file://report.pdf');
  });

  // Achado real de uso (2026-09-06, APK novo de verdade): a função
  // travava sempre com "requer atualização do app baixado da loja
  // (L0)", mesmo num build que tinha expo-print linkado e funcionando.
  // Causa: a checagem prévia testava `NativeModules.ExpoPrint` (registro
  // antigo do bridge do RN), mas expo-print usa a API moderna de módulos
  // (`requireNativeModule`), que nunca aparece ali — nem quando o
  // módulo está disponível de verdade. A checagem sempre dava falso.
  it('não lança o erro de "requer atualização da loja" quando o módulo está disponível', async () => {
    (Print.printToFileAsync as jest.Mock<any>).mockResolvedValue({ uri: 'file://report.pdf' });
    (Sharing.isAvailableAsync as jest.Mock<any>).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock<any>).mockResolvedValue(undefined);

    await expect(
      exportConsultationReportPdf({
        profileName: 'Maria',
        periodDays: 30,
        percentage: 95,
        taken: 28,
        due: 30,
        missed: [],
        medications: [],
      }),
    ).resolves.toBe('file://report.pdf');
  });
});
