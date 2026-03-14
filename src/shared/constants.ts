import type { ExtensionSettings } from './types';

export const EXTENSION_VERSION = '1.0.0';
export const EXTENSION_SOURCE = 'linkedin-lead-capture' as const;
export const DEFAULT_WEBHOOK_URL = '';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  captureEnabled: true,
  webhookUrl: DEFAULT_WEBHOOK_URL,
  captureConnect: true,
  captureLike: true,
  captureMessage: true,
  captureComment: true,
  captureRepost: true,
  captureInmail: true,
  maxRetries: 3,
  retryDelayMs: 1000,
};

export const STORAGE_KEYS = {
  SETTINGS: 'llc_settings',
  CAPTURES: 'llc_captures',
} as const;

export const MAX_CAPTURE_HISTORY = 100;
export const RETRY_ALARM_NAME = 'llc_retry_failed';
export const RETRY_ALARM_INTERVAL_MINUTES = 5;
export const WEBHOOK_TIMEOUT_MS = 10000;
export const DEDUP_WINDOW_MS = 60000;
