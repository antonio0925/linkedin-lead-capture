import type { CaptureEvent, ExtensionSettings } from '../shared/types';
import { StorageManager } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';

const storage = new StorageManager();

// DOM references
const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const captureEnabledToggle = document.getElementById('captureEnabled') as HTMLInputElement;
const captureConnectCheckbox = document.getElementById('captureConnect') as HTMLInputElement;
const captureLikeCheckbox = document.getElementById('captureLike') as HTMLInputElement;
const captureMessageCheckbox = document.getElementById('captureMessage') as HTMLInputElement;
const captureCommentCheckbox = document.getElementById('captureComment') as HTMLInputElement;
const captureRepostCheckbox = document.getElementById('captureRepost') as HTMLInputElement;
const captureInmailCheckbox = document.getElementById('captureInmail') as HTMLInputElement;
const webhookUrlInput = document.getElementById('webhookUrl') as HTMLInputElement;
const webhookHint = document.getElementById('webhookHint') as HTMLDivElement;
const capturesList = document.getElementById('capturesList') as HTMLDivElement;
const captureCount = document.getElementById('captureCount') as HTMLSpanElement;
const retryBtn = document.getElementById('retryBtn') as HTMLButtonElement;

const MAX_DISPLAY = 10;

// ---------------------------------------------------------------------------
// Time-ago helper
// ---------------------------------------------------------------------------
function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Render settings into the form
// ---------------------------------------------------------------------------
function renderSettings(settings: ExtensionSettings): void {
  captureEnabledToggle.checked = settings.captureEnabled;
  captureConnectCheckbox.checked = settings.captureConnect;
  captureLikeCheckbox.checked = settings.captureLike;
  captureMessageCheckbox.checked = settings.captureMessage;
  captureCommentCheckbox.checked = settings.captureComment;
  captureRepostCheckbox.checked = settings.captureRepost;
  captureInmailCheckbox.checked = settings.captureInmail;
  webhookUrlInput.value = settings.webhookUrl;

  // Status dot
  statusDot.classList.toggle('active', settings.captureEnabled);
}

// ---------------------------------------------------------------------------
// Render captures list
// ---------------------------------------------------------------------------
function renderCaptures(captures: CaptureEvent[]): void {
  const display = captures.slice(0, MAX_DISPLAY);

  if (display.length === 0) {
    capturesList.innerHTML = '<div class="empty-state">No captures yet</div>';
    captureCount.textContent = '0 captures';
    retryBtn.classList.add('hidden');
    return;
  }

  capturesList.innerHTML = display
    .map((c) => {
      const actionBadgeMap: Record<string, { cls: string; label: string }> = {
        connect:      { cls: 'badge-connect', label: 'Connect' },
        like:         { cls: 'badge-like', label: 'Like' },
        message_sent: { cls: 'badge-message', label: 'Message' },
        comment:      { cls: 'badge-comment', label: 'Comment' },
        repost:       { cls: 'badge-repost', label: 'Repost' },
        inmail_sent:  { cls: 'badge-inmail', label: 'InMail' },
      };
      const badge = actionBadgeMap[c.action] ?? { cls: 'badge-like', label: c.action };
      const actionClass = badge.cls;
      const actionLabel = badge.label;
      const statusClass = `status-${c.webhookStatus}`;

      return `
      <div class="capture-item">
        <div class="capture-info">
          <div class="capture-name" title="${escapeHtml(c.profile.fullName)}">${escapeHtml(c.profile.fullName)}</div>
          <div class="capture-meta">
            <span class="badge ${actionClass}">${actionLabel}</span>
            <span class="capture-time">${timeAgo(c.timestamp)}</span>
          </div>
        </div>
        <span class="status-badge ${statusClass}">${c.webhookStatus}</span>
      </div>`;
    })
    .join('');

  // Update footer
  captureCount.textContent = `${captures.length} capture${captures.length === 1 ? '' : 's'}`;

  // Show retry button only if there are failed captures
  const hasFailed = captures.some((c) => c.webhookStatus === 'failed');
  retryBtn.classList.toggle('hidden', !hasFailed);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Validate webhook URL
// ---------------------------------------------------------------------------
function validateWebhookUrl(url: string): boolean {
  if (!url) return true; // Empty is ok (just unconfigured)
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

// Master toggle
captureEnabledToggle.addEventListener('change', async () => {
  const captureEnabled = captureEnabledToggle.checked;
  await storage.saveSettings({ captureEnabled });
  statusDot.classList.toggle('active', captureEnabled);
});

// Capture action toggles
captureConnectCheckbox.addEventListener('change', async () => {
  await storage.saveSettings({ captureConnect: captureConnectCheckbox.checked });
});

captureLikeCheckbox.addEventListener('change', async () => {
  await storage.saveSettings({ captureLike: captureLikeCheckbox.checked });
});

captureMessageCheckbox.addEventListener('change', async () => {
  await storage.saveSettings({ captureMessage: captureMessageCheckbox.checked });
});

captureCommentCheckbox.addEventListener('change', async () => {
  await storage.saveSettings({ captureComment: captureCommentCheckbox.checked });
});

captureRepostCheckbox.addEventListener('change', async () => {
  await storage.saveSettings({ captureRepost: captureRepostCheckbox.checked });
});

captureInmailCheckbox.addEventListener('change', async () => {
  await storage.saveSettings({ captureInmail: captureInmailCheckbox.checked });
});

// Webhook URL — save on blur
webhookUrlInput.addEventListener('blur', async () => {
  const url = webhookUrlInput.value.trim();
  if (validateWebhookUrl(url)) {
    webhookUrlInput.classList.remove('error');
    webhookHint.textContent = '';
    webhookHint.classList.remove('error');
    await storage.saveSettings({ webhookUrl: url });
  } else {
    webhookUrlInput.classList.add('error');
    webhookHint.textContent = 'Enter a valid HTTP or HTTPS URL';
    webhookHint.classList.add('error');
  }
});

// Retry failed
retryBtn.addEventListener('click', async () => {
  retryBtn.disabled = true;
  retryBtn.textContent = 'Retrying...';

  await chrome.runtime.sendMessage({ type: 'RETRY_FAILED' });

  // Re-render after a short delay to let the service worker process
  setTimeout(async () => {
    const captures = await storage.getCaptures();
    renderCaptures(captures);
    retryBtn.disabled = false;
    retryBtn.textContent = 'Retry Failed';
  }, 1500);
});

// ---------------------------------------------------------------------------
// Listen for storage changes to update UI in real-time
// ---------------------------------------------------------------------------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEYS.SETTINGS]) {
    const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue as ExtensionSettings;
    renderSettings(newSettings);
  }

  if (changes[STORAGE_KEYS.CAPTURES]) {
    const newCaptures = (changes[STORAGE_KEYS.CAPTURES].newValue as CaptureEvent[]) || [];
    renderCaptures(newCaptures);
  }
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------
(async () => {
  const [settings, captures] = await Promise.all([
    storage.getSettings(),
    storage.getCaptures(),
  ]);

  renderSettings(settings);
  renderCaptures(captures);
})();
