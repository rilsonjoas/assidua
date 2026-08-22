// Shim WEB de services/purchases.ts (W0, 2026-08-22).
//
// Metro resolve `.web.ts` no lugar de `.ts` no bundle web.
//
// Billing é ecossistema separado na web (Play Store não existe aqui).
// Decisão do ROADMAP: feature flag off na v1 — monetização web seria
// Stripe/Pagar.me, decisão própria pra depois. O comportamento espelha
// exatamente o estado pré-chave do módulo nativo: `isPurchasesConfigured`
// false, `getCurrentOffering` null → pro.tsx mostra o aviso "em breve",
// sem nenhum ramo extra de UI.

export interface PurchasesOffering {
  identifier: string;
  // O suficiente pro uso real em pro.tsx (pkg.identifier,
  // pkg.product.priceString). Estruturalmente compatível com os tipos do
  // SDK nativo — as telas só usam tipos, que somem no bundle.
  packages: PurchasesPackage[];
}

export interface PurchasesPackage {
  identifier: string;
  product: { priceString: string; title?: string; identifier?: string };
}

export function initPurchases(): void {}

export function isPurchasesConfigured(): boolean {
  return false;
}

export async function loginPurchases(userId: number): Promise<void> {
  void userId;
}

export async function logoutPurchases(): Promise<void> {}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  return null;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<never> {
  void pkg;
  throw new Error('Assinaturas na web chegam em breve');
}

export async function restorePurchases(): Promise<never> {
  throw new Error('Restaurar compras não está disponível na web');
}
