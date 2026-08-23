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
});
