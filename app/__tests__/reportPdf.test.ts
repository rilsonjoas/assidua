import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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

// "Nome de arquivo legível" (2026-09-08, item 16) — `File`/`copy`
// controláveis por teste (sucesso, ou módulo nativo indisponível ainda),
// mesmo padrão dos mocks de expo-print/expo-sharing acima.
const mockCopy = jest.fn<() => Promise<void>>();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((...parts: any[]) => ({
    uri: parts.map((p) => (typeof p === 'string' ? p : p.uri)).filter(Boolean).join('/'),
    copy: mockCopy,
  })),
  Paths: { cache: { uri: 'file://cache' } },
}));

// Padrão dos testes já existentes nesta suíte, escritos antes do rename
// existir: eles não se importam com nome de arquivo, só com o fluxo
// básico de gerar/compartilhar. Default seguro (rename "falha") mantém
// o comportamento deles idêntico a antes; só a suíte de rename abaixo
// explicitamente liga o sucesso pra testar o novo caminho.
beforeEach(() => {
  mockCopy.mockReset();
  mockCopy.mockRejectedValue(new Error('not mocked by default'));
});

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

// "Nome de arquivo legível" (2026-09-08, item 16) — achado real do
// Rilson: `expo-print` gera um nome genérico/numérico, sem opção de
// nome próprio na API (conferido no .d.ts da lib). Renomeia com
// `expo-file-system` antes de compartilhar — tolerante a falha.
describe('exportConsultationReportPdf — nome de arquivo legível (2026-09-08)', () => {
  beforeEach(() => {
    mockCopy.mockReset();
    (Print.printToFileAsync as jest.Mock<any>).mockReset();
    (Sharing.isAvailableAsync as jest.Mock<any>).mockReset();
    (Sharing.shareAsync as jest.Mock<any>).mockReset();
  });

  it('renomeia pro nome do medicamento filtrado antes de compartilhar', async () => {
    mockCopy.mockResolvedValue(undefined);
    (Print.printToFileAsync as jest.Mock<any>).mockResolvedValue({ uri: 'file:///data/12345.pdf' });
    (Sharing.isAvailableAsync as jest.Mock<any>).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock<any>).mockResolvedValue(undefined);

    const result = await exportConsultationReportPdf({
      profileName: 'Maria',
      periodDays: 30,
      percentage: 95,
      taken: 28,
      due: 30,
      missed: [],
      medications: [{ name: 'Losartana', dosage: '50', unit: 'mg' }],
      medicationName: 'Losartana',
    });

    expect(result).toMatch(/assidua-relatorio-losartana-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(result, expect.anything());
  });

  it('sem medicamento filtrado, nome de arquivo diz "todos-os-medicamentos"', async () => {
    mockCopy.mockResolvedValue(undefined);
    (Print.printToFileAsync as jest.Mock<any>).mockResolvedValue({ uri: 'file:///data/99999.pdf' });
    (Sharing.isAvailableAsync as jest.Mock<any>).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock<any>).mockResolvedValue(undefined);

    const result = await exportConsultationReportPdf({
      profileName: 'Maria',
      periodDays: 30,
      percentage: 95,
      taken: 28,
      due: 30,
      missed: [],
      medications: [],
    });

    expect(result).toMatch(/assidua-relatorio-todos-os-medicamentos-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  // Achado real (2026-09-06, mesmo incidente já documentado nesta
  // suíte): módulo nativo pode falhar de formas imprevisíveis num build
  // sem ele linkado ainda — renomear não pode travar o
  // compartilhamento inteiro.
  it('se o rename falhar, compartilha o arquivo original em vez de travar', async () => {
    mockCopy.mockRejectedValue(new Error('Cannot find native module ExpoFileSystem'));
    (Print.printToFileAsync as jest.Mock<any>).mockResolvedValue({ uri: 'file:///data/55555.pdf' });
    (Sharing.isAvailableAsync as jest.Mock<any>).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock<any>).mockResolvedValue(undefined);

    const result = await exportConsultationReportPdf({
      profileName: 'Maria',
      periodDays: 30,
      percentage: 95,
      taken: 28,
      due: 30,
      missed: [],
      medications: [],
      medicationName: 'Losartana',
    });

    expect(result).toBe('file:///data/55555.pdf');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///data/55555.pdf', expect.anything());
  });
});
