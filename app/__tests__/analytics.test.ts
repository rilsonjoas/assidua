import { describe, it, expect, beforeEach } from '@jest/globals';
import { trackEvent, getTrackedEvents, clearTrackedEvents } from '../services/analytics';

describe('analytics service', () => {
  beforeEach(() => {
    clearTrackedEvents();
  });

  it('registra eventos anônimos na fila local', () => {
    trackEvent('dose_logged', { status: 'taken' });
    trackEvent('pdf_exported', { period_days: 30 });

    const events = getTrackedEvents();
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe('dose_logged');
    expect(events[1].event).toBe('pdf_exported');
  });

  it('limpa os eventos rastreados ao chamar clearTrackedEvents', () => {
    trackEvent('medication_created');
    expect(getTrackedEvents()).toHaveLength(1);

    clearTrackedEvents();
    expect(getTrackedEvents()).toHaveLength(0);
  });
});
