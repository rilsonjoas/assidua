// "Estoque editável em dois lugares" (item 13, 2026-09-07) — achado de
// revisão de código (2026-09-08): app/(tabs)/stock.tsx e a tela de
// editar remédio reimplementavam a mesma validação de quantidade e a
// mesma checagem de "nunca informado" quase palavra por palavra. Uma
// mudança futura nas regras (ex.: um teto máximo) só pegaria as duas se
// alguém lembrasse de editar nos dois lugares — extraído pra um só.
export function parseStockQuantity(typed: string): number | null {
  const quantity = parseFloat(typed);
  if (isNaN(quantity) || quantity < 0) return null;
  return quantity;
}

// Achado real de uso (2026-09-05): remédio cadastrado sem preencher
// "estoque inicial" (opcional) mostrava "0 unid" liso — igual a um
// remédio que genuinamente acabou, sem indicar que ninguém informou
// nada ainda. `last_updated_at` só é preenchido no primeiro `PUT
// /stock` de verdade (ver `StockController::update`); nulo com
// quantidade zero é o sinal confiável de "nunca foi tocado", distinto
// de "acabou".
export function isStockNeverSet(
  stock: { current_quantity: number; last_updated_at: string | null } | null | undefined,
): boolean {
  return stock?.current_quantity === 0 && stock?.last_updated_at === null;
}

// Como escrever a unidade do estoque (2026-09-28).
//
// O bug: `MedicationController.php:66` cria a linha de estoque com
// `'unit' => $data['unit']` — a unidade da DOSAGEM. Cadastrar "Losartana
// 50 mg" guardava estoque em `mg`, e a tela dizia "30 mg" para 30
// comprimidos, ao lado de um "acaba em 30 dias" que não batia com a
// conta. Para o público do app, "0" significa "estou sem remédio" —
// alarme falso.
//
// A matemática nunca esteve errada: `Medication::daysRemaining()` faz
// `floor(current_quantity / dosesPerDay)`, que divide por DOSES POR DIA,
// nunca pela dosagem. O número já é "quantas doses restam".
//
// Tentativa descartada: rotular sempre em "doses", comparando a unidade
// do estoque com a da dose. A comparação é **degenerada** — o controller
// copia uma na outra, então `stockUnit === doseUnit` é sempre verdadeiro
// e o ternário caía sempre no caso errado. Pior, mesmo corrigindo a
// comparação, "doses" mente no líquido: xarope com 200 ml digitados não
// são 200 doses. Não entrou no código.
//
// Solução adotada (decisão do Rilson, 2026-09-28): a unidade do estoque
// passa a ser um campo PRÓPRIO, escolhido em chips na aba Estoque — lá a
// pessoa tem a caixa na mão e sabe em que coisa está contando. No
// cadastro do remédio a pergunta ainda não faz sentido, e é por isso que
// a unidade errada nascia ali.
export function formatStockQuantity(args: {
  quantity: number;
  stockUnit?: string | null;
}): string {
  const { quantity, stockUnit } = args;
  const unidade = (stockUnit ?? '').trim() || 'un';
  return `${quantity} ${unidade}`;
}
