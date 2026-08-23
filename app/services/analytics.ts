// Telemetria e Analytics Anônimo (respeitando LGPD) — sem PII.
// Registra eventos de produto locais para entender o uso e engajamento.

export interface AnalyticsEvent {
  event: string;
  params?: Record<string, unknown>;
  timestamp: string;
}

const eventsQueue: AnalyticsEvent[] = [];

export function trackEvent(event: string, params?: Record<string, unknown>): void {
  const payload: AnalyticsEvent = {
    event,
    params,
    timestamp: new Date().toISOString(),
  };

  eventsQueue.push(payload);
}

export function getTrackedEvents(): AnalyticsEvent[] {
  return [...eventsQueue];
}

export function clearTrackedEvents(): void {
  eventsQueue.length = 0;
}
