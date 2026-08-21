import { Platform } from 'react-native';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

// L1 — monetização (2026-08-21). Fonte de verdade de "é Pro?" continua
// sendo o backend (User.subscription_tier, vindo de /auth/me) — este
// módulo só cuida do fluxo de compra em si (RevenueCat ↔ loja) e de
// manter o app_user_id do RevenueCat sincronizado com o id do usuário
// Laravel, pra o webhook (api/.../RevenueCatWebhookController) saber
// quem atualizar. Depois de uma compra, quem reflete o novo tier na UI
// é um refetch de /auth/me, não este módulo.
//
// Sem chave configurada ainda (pré-conta RevenueCat/pré-produto na
// Play Store) o SDK fica inerte — mesmo padrão do Sentry em
// app/_layout.tsx: roda sem erro, sem oferecer nada de Pro, até a
// chave existir de verdade.
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

let configured = false;

export function initPurchases(): void {
  const apiKey = Platform.OS === 'android' ? ANDROID_KEY : IOS_KEY;
  if (!apiKey) return;

  Purchases.configure({ apiKey });
  configured = true;
}

export function isPurchasesConfigured(): boolean {
  return configured;
}

// Chamado toda vez que authStore.setUser recebe um usuário — garante
// que o app_user_id do RevenueCat seja sempre o id numérico do usuário
// Laravel (como string), nunca o id anônimo que o SDK gera sozinho
// antes do login. Falha de rede aqui não deve travar o login do app.
export async function loginPurchases(userId: number): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(String(userId));
  } catch (error) {
    console.warn('[purchases] logIn falhou', error);
  }
}

export async function logoutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    console.warn('[purchases] logOut falhou', error);
  }
}

// Retorna null tanto se o SDK não estiver configurado quanto se não
// houver nenhuma oferta cadastrada no RevenueCat ainda (caso real hoje,
// antes de L0 terminar) — pro.tsx trata os dois casos do mesmo jeito:
// mantém o aviso "em breve".
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (error) {
    console.warn('[purchases] getOfferings falhou', error);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage) {
  if (!configured) throw new Error('Purchases não configurado');
  return Purchases.purchasePackage(pkg);
}

export async function restorePurchases() {
  if (!configured) throw new Error('Purchases não configurado');
  return Purchases.restorePurchases();
}
