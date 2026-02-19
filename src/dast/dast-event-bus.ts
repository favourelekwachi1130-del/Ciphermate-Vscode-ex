/**
 * DAST Event Bus - Structured events for War Room visualization
 *
 * Emits everything the AI does: strategy, payloads, responses,
 * promising findings, deep-dive spawns, vulnerabilities.
 */

export type DastEventType =
  | 'scan_started'
  | 'scan_completed'
  | 'strategist_started'
  | 'strategist_completed'
  | 'target_context_built'
  | 'endpoint_discovered'
  | 'payload_sent'
  | 'response_received'
  | 'promising_finding'
  | 'deep_dive_spawned'
  | 'deep_dive_result'
  | 'vuln_confirmed'
  | 'circuit_breaker'
  | 'error';

export interface DastEvent {
  type: DastEventType;
  ts: number;
  sessionId: string;
  data?: Record<string, unknown>;
}

export interface DastEventBus {
  push(event: DastEvent): void;
  onEvent(cb: (event: DastEvent) => void): () => void;
  getSessionEvents(sessionId: string): DastEvent[];
  getAllSessions(): string[];
  clearSession(sessionId: string): void;
}

class DastEventBusImpl implements DastEventBus {
  private sessionEvents = new Map<string, DastEvent[]>();
  private listeners: Array<(e: DastEvent) => void> = [];
  private maxEventsPerSession = 5000;

  push(event: DastEvent): void {
    const sessionId = event.sessionId;
    if (!this.sessionEvents.has(sessionId)) {
      this.sessionEvents.set(sessionId, []);
    }
    const arr = this.sessionEvents.get(sessionId)!;
    arr.push(event);
    if (arr.length > this.maxEventsPerSession) arr.shift();
    for (const cb of this.listeners) {
      try { cb(event); } catch (e) { console.warn('DastEventBus listener error', e); }
    }
  }

  onEvent(cb: (event: DastEvent) => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  getSessionEvents(sessionId: string): DastEvent[] {
    return this.sessionEvents.get(sessionId) || [];
  }

  getAllSessions(): string[] {
    return Array.from(this.sessionEvents.keys());
  }

  clearSession(sessionId: string): void {
    this.sessionEvents.delete(sessionId);
  }
}

export const dastEventBus: DastEventBus = new DastEventBusImpl();
