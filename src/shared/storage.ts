import type { CaptureEvent, ExtensionSettings } from './types';
import { DEFAULT_SETTINGS, MAX_CAPTURE_HISTORY, STORAGE_KEYS } from './constants';

export class StorageManager {
  async getSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async saveSettings(partial: Partial<ExtensionSettings>): Promise<void> {
    const current = await this.getSettings();
    const merged = { ...current, ...partial };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  }

  async addCapture(event: CaptureEvent): Promise<void> {
    const captures = await this.getCaptures();
    captures.unshift(event);
    const pruned = captures.slice(0, MAX_CAPTURE_HISTORY);
    await chrome.storage.local.set({ [STORAGE_KEYS.CAPTURES]: pruned });
  }

  async getCaptures(limit?: number): Promise<CaptureEvent[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CAPTURES);
    const captures = (result[STORAGE_KEYS.CAPTURES] as CaptureEvent[]) || [];
    return limit ? captures.slice(0, limit) : captures;
  }

  async updateCaptureStatus(
    id: string,
    status: CaptureEvent['webhookStatus'],
    error?: string,
  ): Promise<void> {
    const captures = await this.getCaptures();
    const index = captures.findIndex((c) => c.id === id);
    if (index === -1) return;

    captures[index].webhookStatus = status;
    captures[index].webhookAttempts += 1;
    if (error) {
      captures[index].webhookLastError = error;
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.CAPTURES]: captures });
  }

  async clearCaptures(): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.CAPTURES]: [] });
  }

  async getPendingCaptures(): Promise<CaptureEvent[]> {
    const captures = await this.getCaptures();
    const settings = await this.getSettings();
    return captures.filter(
      (c) => c.webhookStatus === 'failed' && c.webhookAttempts < settings.maxRetries,
    );
  }
}
