import { Platform } from 'react-native';
import { generateConsultationReportHtml, ReportData } from './reportHtml';

export async function exportConsultationReportPdf(data: ReportData): Promise<string | void> {
  const html = generateConsultationReportHtml(data);

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
    }
    return;
  }

  let Print: typeof import('expo-print');
  let Sharing: typeof import('expo-sharing');

  try {
    Print = require('expo-print');
    Sharing = require('expo-sharing');
  } catch {
    throw new Error('Recurso de impressão em PDF indisponível nesta versão do app. Atualize o aplicativo.');
  }

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      UTI: '.pdf',
      mimeType: 'application/pdf',
      dialogTitle: 'Relatório de Adesão - Assídua',
    });
  }

  return uri;
}
