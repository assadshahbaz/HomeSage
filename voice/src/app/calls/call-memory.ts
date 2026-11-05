import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../../infra/config/app-config.js';
import { APP_CONFIG } from '../../infra/config/app-config.symbol.js';
import type { HomesageProperty } from '../homesage/chat-events.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CallState {
  readonly sessionId: string;
  readonly properties: Map<string, HomesageProperty>;
  touchedAt: number;
}

/**
 * What this server remembers about each live call: the HomeSage session it
 * uses, and every listing the agent has been told about, so a viewing can only
 * be booked for a home that really came up. Held in memory and dropped when the
 * call ends or goes quiet for longer than the configured time, so it suits one
 * server instance, which is all a demo runs.
 */
@Injectable()
export class CallMemory {
  private readonly calls = new Map<string, CallState>();

  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** The HomeSage session id for a call: the call id itself when it is a UUID. */
  public sessionIdFor(callId: string): string {
    return this.stateFor(callId).sessionId;
  }

  /** Records listings the agent has been given in this call. */
  public rememberProperties(callId: string, properties: readonly HomesageProperty[]): void {
    const state = this.stateFor(callId);
    for (const property of properties) {
      state.properties.set(property.id, property);
    }
  }

  /** A listing this call has heard about, or null. */
  public propertyFor(callId: string, ref: string): HomesageProperty | null {
    return this.stateFor(callId).properties.get(ref) ?? null;
  }

  /** Forgets a call, once its end of call report has arrived. */
  public forget(callId: string): void {
    this.calls.delete(callId);
  }

  private stateFor(callId: string): CallState {
    const now = Date.now();
    this.dropStale(now);
    let state = this.calls.get(callId);
    if (state === undefined) {
      state = {
        sessionId: UUID.test(callId) ? callId.toLowerCase() : randomUUID(),
        properties: new Map(),
        touchedAt: now,
      };
      this.calls.set(callId, state);
    }
    state.touchedAt = now;
    return state;
  }

  // A call whose end of call report never arrived would otherwise stay forever.
  private dropStale(now: number): void {
    for (const [callId, state] of this.calls) {
      if (now - state.touchedAt > this.config.callMemoryTtlMs) {
        this.calls.delete(callId);
      }
    }
  }
}
