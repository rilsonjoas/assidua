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
