import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockStorage } from '../mocks/chrome-api';
import { StorageManager } from '../../src/shared/storage';
import { DEFAULT_SETTINGS, MAX_CAPTURE_HISTORY } from '../../src/shared/constants';
import type { CaptureEvent } from '../../src/shared/types';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCaptureEvent(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: overrides.id ?? `capture-${Math.random().toString(36).slice(2)}`,
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    action: overrides.action ?? 'connect',
    profile: overrides.profile ?? {
      fullName: 'Test User',
      headline: 'Engineer at TestCo',
      companyName: 'TestCo',
      linkedinUrl: 'https://www.linkedin.com/in/testuser/',
      profileImageUrl: 'https://example.com/photo.jpg',
    },
    pageType: overrides.pageType ?? 'profile',
    pageUrl: overrides.pageUrl ?? 'https://www.linkedin.com/in/testuser/',
    webhookStatus: overrides.webhookStatus ?? 'pending',
    webhookAttempts: overrides.webhookAttempts ?? 0,
    webhookLastError: overrides.webhookLastError,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('StorageManager', () => {
  let storage: StorageManager;

  beforeEach(() => {
    resetMockStorage();
    storage = new StorageManager();
  });

  // ── Settings ───────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('returns default settings when storage is empty', async () => {
      const settings = await storage.getSettings();
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('merges stored partial settings with defaults', async () => {
      await chrome.storage.local.set({
        llc_settings: { webhookUrl: 'https://example.com/hook' },
      });

      const settings = await storage.getSettings();
      expect(settings.webhookUrl).toBe('https://example.com/hook');
      // Defaults should fill in the rest
      expect(settings.captureEnabled).toBe(DEFAULT_SETTINGS.captureEnabled);
      expect(settings.maxRetries).toBe(DEFAULT_SETTINGS.maxRetries);
    });
  });

  describe('saveSettings', () => {
    it('saves and reads settings', async () => {
      await storage.saveSettings({ webhookUrl: 'https://hooks.test.com/abc' });
      const settings = await storage.getSettings();
      expect(settings.webhookUrl).toBe('https://hooks.test.com/abc');
    });

    it('partial update merges correctly without clobbering other fields', async () => {
      await storage.saveSettings({ webhookUrl: 'https://hooks.test.com/abc' });
      await storage.saveSettings({ captureEnabled: false });

      const settings = await storage.getSettings();
      expect(settings.webhookUrl).toBe('https://hooks.test.com/abc');
      expect(settings.captureEnabled).toBe(false);
      expect(settings.maxRetries).toBe(DEFAULT_SETTINGS.maxRetries);
    });
  });

  // ── Captures ───────────────────────────────────────────────────────────

  describe('addCapture', () => {
    it('adds capture to the front of the list', async () => {
      const first = makeCaptureEvent({ id: 'first' });
      const second = makeCaptureEvent({ id: 'second' });

      await storage.addCapture(first);
      await storage.addCapture(second);

      const captures = await storage.getCaptures();
      expect(captures[0].id).toBe('second');
      expect(captures[1].id).toBe('first');
    });

    it('prunes captures beyond MAX_CAPTURE_HISTORY', async () => {
      // Add MAX_CAPTURE_HISTORY + 5 captures
      for (let i = 0; i < MAX_CAPTURE_HISTORY + 5; i++) {
        await storage.addCapture(makeCaptureEvent({ id: `cap-${i}` }));
      }

      const captures = await storage.getCaptures();
      expect(captures.length).toBe(MAX_CAPTURE_HISTORY);
      // Most recent should be first
      expect(captures[0].id).toBe(`cap-${MAX_CAPTURE_HISTORY + 4}`);
    });
  });

  describe('getCaptures', () => {
    it('returns empty array when no captures exist', async () => {
      const captures = await storage.getCaptures();
      expect(captures).toEqual([]);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.addCapture(makeCaptureEvent({ id: `cap-${i}` }));
      }

      const captures = await storage.getCaptures(3);
      expect(captures.length).toBe(3);
    });
  });

  describe('updateCaptureStatus', () => {
    it('updates capture status by ID', async () => {
      const event = makeCaptureEvent({ id: 'update-me', webhookStatus: 'pending', webhookAttempts: 0 });
      await storage.addCapture(event);

      await storage.updateCaptureStatus('update-me', 'sent');

      const captures = await storage.getCaptures();
      const updated = captures.find((c) => c.id === 'update-me')!;
      expect(updated.webhookStatus).toBe('sent');
      expect(updated.webhookAttempts).toBe(1);
    });

    it('stores error message when provided', async () => {
      const event = makeCaptureEvent({ id: 'fail-me', webhookStatus: 'pending', webhookAttempts: 0 });
      await storage.addCapture(event);

      await storage.updateCaptureStatus('fail-me', 'failed', 'Connection refused');

      const captures = await storage.getCaptures();
      const updated = captures.find((c) => c.id === 'fail-me')!;
      expect(updated.webhookStatus).toBe('failed');
      expect(updated.webhookLastError).toBe('Connection refused');
    });

    it('does nothing for non-existent ID', async () => {
      await storage.addCapture(makeCaptureEvent({ id: 'existing' }));
      await storage.updateCaptureStatus('does-not-exist', 'sent');

      const captures = await storage.getCaptures();
      expect(captures.length).toBe(1);
      expect(captures[0].id).toBe('existing');
    });
  });

  describe('clearCaptures', () => {
    it('empties the captures list', async () => {
      await storage.addCapture(makeCaptureEvent());
      await storage.addCapture(makeCaptureEvent());
      await storage.clearCaptures();

      const captures = await storage.getCaptures();
      expect(captures).toEqual([]);
    });
  });

  describe('getPendingCaptures', () => {
    it('returns only failed captures under max retries', async () => {
      await storage.addCapture(makeCaptureEvent({ id: 'sent', webhookStatus: 'sent', webhookAttempts: 1 }));
      await storage.addCapture(makeCaptureEvent({ id: 'failed-low', webhookStatus: 'failed', webhookAttempts: 1 }));
      await storage.addCapture(makeCaptureEvent({ id: 'failed-max', webhookStatus: 'failed', webhookAttempts: 3 }));
      await storage.addCapture(makeCaptureEvent({ id: 'pending', webhookStatus: 'pending', webhookAttempts: 0 }));

      // Default maxRetries = 3, so only 'failed-low' (attempts=1 < 3) qualifies
      const pending = await storage.getPendingCaptures();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe('failed-low');
    });

    it('returns empty array when no captures are failed', async () => {
      await storage.addCapture(makeCaptureEvent({ webhookStatus: 'sent', webhookAttempts: 1 }));
      const pending = await storage.getPendingCaptures();
      expect(pending).toEqual([]);
    });

    it('respects custom maxRetries from settings', async () => {
      await storage.saveSettings({ maxRetries: 5 });
      await storage.addCapture(makeCaptureEvent({ id: 'retry-4', webhookStatus: 'failed', webhookAttempts: 4 }));

      const pending = await storage.getPendingCaptures();
      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe('retry-4');
    });
  });
});
