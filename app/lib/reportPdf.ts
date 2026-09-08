import { Platform } from 'react-native';
import { generateConsultationReportHtml, ReportData } from './reportHtml';

// "Nome de arquivo legível" (2026-09-08, item 16) — achado real do
// Rilson testando o botão de PDF pela primeira vez: `expo-print` não
// tem opção de nome de arquivo (conferido no próprio .d.ts da lib, só
// html/width/height/margens) — o arquivo temporário sai com um nome
// genérico/numérico, que é isso que aparece ao compartilhar/salvar.
// Web já não tem esse problema (o HTML tem <title>, o navegador usa
// como sugestão de nome ao "Salvar como PDF").
function buildReportFileName(data: ReportData): string {
  const datePart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const scopePart = data.medicationName ? slugify(data.medicationName) : 'todos-os-medicamentos';
  return `assidua-relatorio-${scopePart}-${datePart}.pdf`;
}

function slugify(text: string): string {
  const withoutAccents = text.normalize('NFD').replace(/[̀-ͯ]/g, ''); // remove marcas de acento (NFD)
  const slug = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'medicamento';
}

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
    throw new Error('Recurso de impressão em PDF indisponível nesta versão do app. Utilize a opção "Compartilhar resumo pra consulta".');
  }

  try {
    const { uri } = await Print.printToFileAsync({ html });

    // Renomeia pra um nome legível antes de compartilhar — tolerante a
    // falha: `expo-file-system` é módulo nativo (mesmo cuidado de
    // `pickPhoto`, `require` tardio isolado num try/catch próprio). Se
    // o rename não der certo por qualquer motivo, compartilha o
    // arquivo original (nome feio, mas funciona) em vez de travar o
    // recurso inteiro.
    let shareUri = uri;
    try {
      const FileSystemModule: typeof import('expo-file-system') = require('expo-file-system');
      const { File, Paths } = FileSystemModule;
      const destination = new File(Paths.cache, buildReportFileName(data));
      await new File(uri).copy(destination, { overwrite: true });
      shareUri = destination.uri;
    } catch (renameErr) {
      console.error('[reportPdf] não deu pra renomear, usando nome original', renameErr);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: 'Relatório de Adesão - Assídua',
      });
    }

    return shareUri;
  } catch (err: any) {
    throw new Error(err?.message ?? 'Não foi possível gerar o arquivo PDF.');
  }
}
