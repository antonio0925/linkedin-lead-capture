/**
 * Content script entry point for LinkedIn Lead Capture.
 *
 * Bootstraps all content-side modules:
 *  1. Loads settings from the service worker
 *  2. Watches for settings changes in real time
 *  3. Starts SPA observer to track the current page type
 *  4. Starts click interceptor to capture Connect/Like actions
 */

import type {
  CaptureAction,
  CaptureEvent,
  ExtensionSettings,
  LinkedInPageType,
} from '../shared/types';
import type { ContentMessage, ServiceWorkerResponse } from '../shared/messages';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants';
import { scrapeProfile } from './scraper';
import { startInterceptor } from './interceptor';
import { startSPAObserver } from './spa-observer';

// ─── Logging helper ────────────────────────────────────────────────────

function log(...args: unknown[]): void {
  console.log('[LLC]', ...args);
}

function warn(...args: unknown[]): void {
  console.warn('[LLC]', ...args);
}

// ─── Visual toast (shows capture status without DevTools) ──────────────

function showToast(message: string, success: boolean): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontWeight: '500',
    background: success ? '#0a66c2' : '#cc1016',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    zIndex: '999999',
    transition: 'opacity 0.3s ease',
    opacity: '0',
    maxWidth: '320px',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ─── Page type detection ───────────────────────────────────────────────

function detectPageType(url: string = window.location.href): LinkedInPageType {
  const path = new URL(url).pathname;
  if (path.startsWith('/in/')) return 'profile';
  if (path.startsWith('/feed') || path === '/') return 'feed';
  if (path.startsWith('/search/')) return 'search';
  if (path.startsWith('/company/')) return 'company';
  return 'unknown';
}

// ─── State ─────────────────────────────────────────────────────────────

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let currentPageType: LinkedInPageType = detectPageType();

// ─── Settings management ───────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  try {
    const response: ServiceWorkerResponse = await chrome.runtime.sendMessage({
      type: 'GET_SETTINGS',
    } satisfies ContentMessage);

    if (response?.type === 'SETTINGS') {
      settings = response.payload;
      log('Settings loaded:', settings);
    }
  } catch (err) {
    warn('Failed to load settings, using defaults:', err);
  }
}

function watchSettingsChanges(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    const settingsChange = changes[STORAGE_KEYS.SETTINGS];
    if (settingsChange?.newValue) {
      settings = settingsChange.newValue as ExtensionSettings;
      log('Settings updated:', settings);
    }
  });
}

// ─── Gate: should we capture this action? ──────────────────────────────

function isEnabled(): boolean {
  return settings.captureEnabled;
}

function shouldCapture(action: CaptureAction): boolean {
  if (!settings.captureEnabled) return false;
  if (action === 'connect' && !settings.captureConnect) return false;
  if (action === 'like' && !settings.captureLike) return false;
  if (action === 'message_sent' && !settings.captureMessage) return false;
  if (action === 'comment' && !settings.captureComment) return false;
  if (action === 'repost' && !settings.captureRepost) return false;
  if (action === 'inmail_sent' && !settings.captureInmail) return false;
  return true;
}

// ─── Capture handler ───────────────────────────────────────────────────

function handleCapture(action: CaptureAction, element: HTMLElement): void {
  if (!shouldCapture(action)) {
    log(`Skipping ${action} — disabled in settings`);
    return;
  }

  log(`Intercepted "${action}" click on`, currentPageType, 'page');

  const profile = scrapeProfile({
    action,
    element,
    pageType: currentPageType,
  });

  if (!profile) {
    warn('Could not scrape profile data — skipping capture');
    showToast(`LLC: Failed to capture ${action} — could not read profile`, false);
    return;
  }

  // Supplement: if key fields are missing, try scraping the profile page behind overlays
  // (e.g., messaging overlay on a profile page — full profile data is right there)
  if (!profile.companyName || !profile.headline || !profile.location) {
    const bgProfile = scrapeProfile({ action: 'connect', element, pageType: 'profile' });
    if (bgProfile) {
      if (!profile.companyName && bgProfile.companyName) profile.companyName = bgProfile.companyName;
      if (!profile.headline && bgProfile.headline) profile.headline = bgProfile.headline;
      if (!profile.location && bgProfile.location) profile.location = bgProfile.location;
      if (!profile.connectionDegree && bgProfile.connectionDegree) profile.connectionDegree = bgProfile.connectionDegree;
      if (!profile.profileImageUrl && bgProfile.profileImageUrl) profile.profileImageUrl = bgProfile.profileImageUrl;
      if (!profile.linkedinUrl && bgProfile.linkedinUrl) profile.linkedinUrl = bgProfile.linkedinUrl;
      log('Supplemented profile with background page data');
    }
  }

  // Fallback: if scraper couldn't find linkedinUrl, extract from page URL
  if (!profile.linkedinUrl) {
    const currentUrl = window.location.href;
    const inMatch = currentUrl.match(/linkedin\.com\/in\/[\w-]+/);
    if (inMatch) {
      profile.linkedinUrl = 'https://www.' + inMatch[0] + '/';
      log('Used page URL as linkedinUrl fallback:', profile.linkedinUrl);
    }
  }

  // Also try extracting from any nearby profile link in the DOM
  if (!profile.linkedinUrl) {
    const nearbyLink = element.closest('[data-urn]')?.querySelector('a[href*="/in/"]') as HTMLAnchorElement | null;
    if (nearbyLink?.href) {
      const href = nearbyLink.href;
      const slug = href.match(/\/in\/([\w-]+)/);
      if (slug) {
        profile.linkedinUrl = `https://www.linkedin.com/in/${slug[1]}/`;
        log('Used nearby link as linkedinUrl fallback:', profile.linkedinUrl);
      }
    }
  }

  if (!profile.linkedinUrl) {
    warn('Could not determine LinkedIn URL — skipping capture');
    showToast(`LLC: Captured ${profile.fullName} but no LinkedIn URL found`, false);
    return;
  }

  log('Scraped profile:', profile.fullName, '—', profile.linkedinUrl);
  showToast(`LLC: Captured ${action} — ${profile.fullName}`, true);

  const captureEvent: CaptureEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    profile,
    pageType: currentPageType,
    pageUrl: window.location.href,
    webhookStatus: 'pending',
    webhookAttempts: 0,
  };

  // Fire-and-forget to service worker
  chrome.runtime.sendMessage({
    type: 'CAPTURE_EVENT',
    payload: captureEvent,
  } satisfies ContentMessage).then((response) => {
    if (response?.success) {
      log(`Capture ${captureEvent.id} acknowledged`);
    } else {
      warn(`Capture ${captureEvent.id} — service worker did not ACK`);
    }
  }).catch((err) => {
    warn('Failed to send capture to service worker:', err);
  });
}

// ─── Bootstrap ─────────────────────────────────────────────────────────

async function init(): Promise<void> {
  log('Initializing on', window.location.href);

  // 1. Load settings from service worker
  await loadSettings();

  // 2. Listen for real-time setting changes
  watchSettingsChanges();

  // 3. Track SPA navigation for page type
  const stopSPA = startSPAObserver((url) => {
    const newType = detectPageType(url);
    log(`Navigation: ${currentPageType} → ${newType}  (${url})`);
    currentPageType = newType;
  });

  // 4. Start click interceptor
  const stopInterceptor = startInterceptor(handleCapture, isEnabled);

  log('Ready — interceptor and SPA observer running');

  // Expose cleanup for HMR / testing
  (window as unknown as Record<string, unknown>).__llc_cleanup = () => {
    stopSPA();
    stopInterceptor();
    log('Cleaned up');
  };
}

init();
