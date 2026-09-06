import { describe, it, expect } from '@jest/globals';
import { photoErrorMessage } from '../app/medication/[id]';

const t = ((key: string) => key) as any;

// Achado real de uso (2026-09-06): upload de foto chegava na tela como
// "Error request failed with status code 500" cru — sem contexto,
// confuso pro público idoso do app. Um 413/500 sem corpo JSON não tem
// `response.data.message` nenhum, então caía direto no fallback
// genérico. Esta função dá um passo acionável em vez de só o status.
describe('photoErrorMessage', () => {
  it('usa a mensagem do servidor quando existe (validação 422)', () => {
    const err = { response: { status: 422, data: { message: 'A foto deve ser uma imagem válida.' } } };
    expect(photoErrorMessage(err, t)).toBe('A foto deve ser uma imagem válida.');
  });

  it('junta erros de validação por campo quando não há "message"', () => {
    const err = { response: { status: 422, data: { errors: { photo: ['O campo foto é obrigatório.'] } } } };
    expect(photoErrorMessage(err, t)).toBe('O campo foto é obrigatório.');
  });

  it('413 (nginx rejeitando payload grande) sugere trocar de foto, não um código HTTP cru', () => {
    const err = { response: { status: 413, data: {} } };
    expect(photoErrorMessage(err, t)).toBe('medicationForm.errorPhotoTooLarge');
  });

  // O bug de verdade achado em produção: 500 sem corpo JSON nenhum
  // (PHP-FPM truncando o upload antes do Laravel processar).
  it('500 sem corpo JSON sugere que pode ser o tamanho, não "Erro ao atualizar a foto" genérico', () => {
    const err = { response: { status: 500, data: null } };
    expect(photoErrorMessage(err, t)).toBe('medicationForm.errorPhotoServer');
  });

  it('sem response nenhum (falha de rede) tem mensagem própria', () => {
    const err = { message: 'Network Error' };
    expect(photoErrorMessage(err, t)).toBe('medicationForm.errorPhotoNetwork');
  });

  it('erro genuinamente desconhecido cai no fallback genérico por último', () => {
    const err = { response: { status: 400, data: {} }, message: 'algo estranho' };
    expect(photoErrorMessage(err, t)).toBe('algo estranho');
  });
});
