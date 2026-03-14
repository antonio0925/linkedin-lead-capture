import type {
  CaptureEvent,
  WebhookPayload,
} from '../shared/types';
import type { ContentMessage } from '../shared/messages';
import { StorageManager } from '../shared/storage';
import { WebhookClient } from '../shared/webhook-client';
import {
  DEFAULT_SETTINGS,
  DEDUP_WINDOW_MS,
  EXTENSION_SOURCE,
  EXTENSION_VERSION,
  RETRY_ALARM_INTERVAL_MINUTES,
  RETRY_ALARM_NAME,
} from '../shared/constants';

const storage = new StorageManager();
const webhook = new WebhookClient();

// ---------------------------------------------------------------------------
// Install: seed default settings & create retry alarm
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await storage.getSettings();
  // Only write defaults if settings have never been persisted
  if (!settings.webhookUrl && settings.captureEnabled === DEFAULT_SETTINGS.captureEnabled) {
    await storage.saveSettings(DEFAULT_SETTINGS);
  }

  // Create (or recreate) the periodic retry alarm
  await chrome.alarms.create(RETRY_ALARM_NAME, {
    periodInMinutes: RETRY_ALARM_INTERVAL_MINUTES,
  });
});

// ---------------------------------------------------------------------------
// Dedup helper — same linkedinUrl + action within DEDUP_WINDOW_MS
// ---------------------------------------------------------------------------
async function isDuplicate(event: CaptureEvent): Promise<boolean> {
  const captures = await storage.getCaptures();
  const now = new Date(event.timestamp).getTime();

  return captures.some((c) => {
    if (c.profile.linkedinUrl !== event.profile.linkedinUrl) return false;
    if (c.action !== event.action) return false;
    const diff = now - new Date(c.timestamp).getTime();
    return diff >= 0 && diff < DEDUP_WINDOW_MS;
  });
}

// ---------------------------------------------------------------------------
// Build webhook payload from a capture event
// ---------------------------------------------------------------------------
function buildPayload(event: CaptureEvent): WebhookPayload {
  return {
    source: EXTENSION_SOURCE,
    version: EXTENSION_VERSION,
    capturedAt: event.timestamp,
    action: event.action,
    pageType: event.pageType,
    pageUrl: event.pageUrl,
    profile: event.profile,
  };
}

// ---------------------------------------------------------------------------
// Dispatch webhook for a single capture, update its status in storage
// ---------------------------------------------------------------------------
async function dispatchWebhook(event: CaptureEvent): Promise<void> {
  const settings = await storage.getSettings();

  if (!settings.webhookUrl) {
    await storage.updateCaptureStatus(event.id, 'failed', 'No webhook URL configured');
    return;
  }

  const payload = buildPayload(event);
  const result = await webhook.sendToWebhook(payload, settings);

  if (result.success) {
    await storage.updateCaptureStatus(event.id, 'sent');
  } else {
    await storage.updateCaptureStatus(event.id, 'failed', result.error);
  }
}

// ---------------------------------------------------------------------------
// Message handler (content-script / popup -> service worker)
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener(
  (message: ContentMessage, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'CAPTURE_EVENT': {
          const event = message.payload;

          // Dedup check
          if (await isDuplicate(event)) {
            sendResponse({ type: 'ACK', success: true });
            return;
          }

          // Store the capture (starts as pending)
          await storage.addCapture(event);

          // Dispatch webhook asynchronously
          await dispatchWebhook(event);

          sendResponse({ type: 'ACK', success: true });
          break;
        }

        case 'GET_SETTINGS': {
          const settings = await storage.getSettings();
          sendResponse({ type: 'SETTINGS', payload: settings });
          break;
        }

        case 'RETRY_FAILED': {
          const pending = await storage.getPendingCaptures();
          for (const capture of pending) {
            await storage.updateCaptureStatus(capture.id, 'retrying');
            await dispatchWebhook(capture);
          }
          sendResponse({ type: 'ACK', success: true });
          break;
        }

        default:
          sendResponse({ type: 'ACK', success: false });
      }
    })();

    // Return true to keep the message channel open for async sendResponse
    return true;
  },
);

// ---------------------------------------------------------------------------
// Alarm handler — retry failed captures periodically
// ---------------------------------------------------------------------------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RETRY_ALARM_NAME) return;

  const pending = await storage.getPendingCaptures();
  for (const capture of pending) {
    await storage.updateCaptureStatus(capture.id, 'retrying');
    await dispatchWebhook(capture);
  }
});
