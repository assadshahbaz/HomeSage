import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { chatRequestSchema } from '@api/contracts';

const STORAGE_KEY = 'hs-session-id';

/**
 * The id that keys this browser's conversation memory on the server, kept
 * across reloads in `localStorage`. A stored value is used only when it is a
 * UUID, as the API requires. Storage may be blocked, in which case the id
 * lasts for this visit only.
 */
@Injectable({ providedIn: 'root' })
export class ChatSession {
  private readonly storage = storageOf(inject(DOCUMENT).defaultView);
  private readonly current = signal(this.readStored() ?? this.store(crypto.randomUUID()));

  public readonly id = this.current.asReadonly();

  /** Starts a new conversation: a fresh id, remembered from now on. */
  public renew(): void {
    this.current.set(this.store(crypto.randomUUID()));
  }

  private readStored(): string | null {
    try {
      const stored = chatRequestSchema.shape.sessionId.safeParse(
        this.storage?.getItem(STORAGE_KEY),
      );
      return stored.success ? stored.data : null;
    } catch {
      return null;
    }
  }

  private store(id: string): string {
    try {
      this.storage?.setItem(STORAGE_KEY, id);
    } catch {
      // Blocked storage: the id still holds until the page is closed.
    }
    return id;
  }
}

// Reading `localStorage` itself throws where storage is blocked.
function storageOf(window: Window | null): Storage | null {
  try {
    return window?.localStorage ?? null;
  } catch {
    return null;
  }
}
