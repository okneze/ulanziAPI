import type { PushCandidate, PushContentRequest } from '../schemas/push.js';
import type { Priority } from '../schemas/response.js';

export interface StoredEntry {
  deviceId: string;
  priority: Priority;
  candidates: PushCandidate[];
  fallback: { type: 'text'; text: string; color?: string };
  /** Unix timestamp (ms) when this entry expires */
  expiresAt: number;
}

export class ContentStore {
  private readonly store = new Map<string, StoredEntry>();

  /**
   * Stores content for a device and returns the expiry Date.
   */
  set(req: PushContentRequest): Date {
    const expiresAt = Date.now() + req.ttlSec * 1000;
    this.store.set(req.deviceId, {
      deviceId: req.deviceId,
      priority: req.priority ?? 'normal',
      candidates: req.candidates,
      fallback: req.fallback ?? { type: 'text', text: '--' },
      expiresAt,
    });
    return new Date(expiresAt);
  }

  /**
   * Returns stored content for a device, or null if absent / expired.
   */
  get(deviceId: string): StoredEntry | null {
    const entry = this.store.get(deviceId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(deviceId);
      return null;
    }
    return entry;
  }

  /**
   * Removes stored content for a device.
   */
  delete(deviceId: string): void {
    this.store.delete(deviceId);
  }

  /**
   * Removes all entries. Useful in tests.
   */
  clear(): void {
    this.store.clear();
  }
}

/** Singleton instance shared across the process. */
export const contentStore = new ContentStore();
