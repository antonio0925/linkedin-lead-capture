# LinkedIn Lead Capture

Chrome extension that transparently captures profile data whenever you interact with people on LinkedIn (Connect, Like, Message, Comment, Repost, InMail) and forwards it to your personal n8n webhook for CRM ingestion.

## How It Works

```
You click Connect/Like/Message on LinkedIn
        ↓
Extension intercepts the click (without blocking it)
        ↓
Scrapes profile data from the page (name, headline, company, URL)
        ↓
Sends payload to YOUR n8n webhook
        ↓
n8n creates/updates the contact in HubSpot under YOUR account
```

The extension runs silently in the background. You'll see a small toast notification in the bottom-right corner of LinkedIn when a capture fires.

## Quick Start

### 1. Clone & Build

```bash
git clone https://github.com/antonio0925/linkedin-lead-capture.git
cd linkedin-lead-capture
npm install
npm run build
```

### 2. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder inside this project
5. Pin the extension to your toolbar

### 3. Set Up Your n8n Webhook (REQUIRED)

> **Each team member MUST create their own n8n webhook.** This ensures activities are logged under your own CRM account and avoids cross-contamination of activity data.

See [Setting Up Your n8n Workflow](#setting-up-your-n8n-workflow) below.

### 4. Configure the Extension

1. Click the extension icon in Chrome
2. Paste your personal webhook URL
3. Toggle which actions you want to capture (Connect, Like, etc.)
4. You're live

## Setting Up Your n8n Workflow

### Why You Need Your Own Workflow

The extension sends raw capture data to a webhook. The **n8n workflow** is what processes that data and pushes it to HubSpot. Each team member needs their own workflow so that:

- Contacts are assigned to **your** HubSpot owner ID
- Activity notes reference **your** interactions
- You can customize which actions trigger CRM updates vs. which are just logged
- Your webhook URL is unique to you (avoids conflicts)

### Step-by-Step: Create Your Workflow

1. **Log in to n8n** at your team's instance
2. **Create a new workflow** named `LinkedIn Lead Capture - [Your Name]`
3. **Add a Webhook node** (this is your trigger):
   - Method: `POST`
   - Path: Choose something unique (e.g., `linkedin-capture-yourname`)
   - Response Mode: `Immediately`
   - Copy the **Production URL** — this is what you'll paste into the extension
4. **Add a Function node** to transform the payload:

```javascript
// Extract the profile data from the webhook payload
const { action, profile, capturedAt, pageType } = $input.first().json;

return {
  json: {
    email: '', // Extension doesn't capture email — HubSpot will need LinkedIn URL as identifier
    firstname: profile.fullName?.split(' ')[0] || '',
    lastname: profile.fullName?.split(' ').slice(1).join(' ') || '',
    company: profile.companyName || '',
    jobtitle: profile.headline || '',
    linkedin_url: profile.linkedinUrl || '',
    linkedin_profile_image: profile.profileImageUrl || '',
    location: profile.location || '',
    connection_degree: profile.connectionDegree || '',
    lead_source: 'LinkedIn Lead Capture',
    lead_capture_action: action,
    lead_capture_page: pageType,
    lead_capture_date: capturedAt,
    hubspot_owner_id: 'YOUR_HUBSPOT_OWNER_ID', // <-- CHANGE THIS
  }
};
```

5. **Add a HubSpot node** (Create/Update Contact):
   - Operation: `Create or Update`
   - Match by: `linkedin_url` (custom property — create it in HubSpot if it doesn't exist)
   - Map the fields from the Function node output
6. **(Optional) Add a second HubSpot node** to log a Note/Activity:
   - Creates a note like: `[LinkedIn Lead Capture] Connected with Joshua Maltz on 2026-03-14`
   - Associates the note with the contact
7. **Activate the workflow** and copy your webhook URL

### Payload Reference

The extension sends this JSON to your webhook on every capture:

```json
{
  "source": "linkedin-lead-capture",
  "version": "1.0.0",
  "capturedAt": "2026-03-14T14:30:45.123Z",
  "action": "connect",
  "pageType": "profile",
  "pageUrl": "https://www.linkedin.com/in/joshua-maltz/",
  "profile": {
    "fullName": "Joshua Maltz",
    "headline": "Product Manager at Stripe",
    "companyName": "Stripe",
    "linkedinUrl": "https://www.linkedin.com/in/joshua-maltz/",
    "profileImageUrl": "https://media.licdn.com/...",
    "location": "San Francisco, CA",
    "connectionDegree": "2nd"
  }
}
```

**Action types:** `connect`, `like`, `message_sent`, `comment`, `repost`, `inmail_sent`

**Page types:** `profile`, `feed`, `search`, `company`, `unknown`

### HubSpot Custom Properties You'll Need

Create these custom properties in HubSpot (Settings > Properties > Contact):

| Property | Internal Name | Type |
|----------|--------------|------|
| LinkedIn URL | `linkedin_url` | Single-line text |
| LinkedIn Profile Image | `linkedin_profile_image` | Single-line text |
| Connection Degree | `connection_degree` | Single-line text |
| Lead Capture Action | `lead_capture_action` | Single-line text |
| Lead Capture Date | `lead_capture_date` | Date picker |

## Development

```bash
# Watch mode (auto-rebuilds on file changes)
npm run watch

# After rebuilding, go to chrome://extensions and click the refresh icon
# on the LinkedIn Lead Capture card to reload

# Run tests
npm test

# Lint
npm run lint

# Package for distribution
npm run zip
```

### Project Structure

```
src/
  content/          # Content script (runs on LinkedIn pages)
    index.ts        # Bootstrap — loads settings, starts interceptor
    interceptor.ts  # Click event delegation + button matching
    scraper.ts      # DOM scraping (profile, feed, search, messaging)
    selectors.ts    # CSS selectors (single source of truth)
    spa-observer.ts # SPA navigation detection (pushState/popstate)
  background/
    service-worker.ts  # Handles captures, dedup, webhook dispatch
  shared/
    types.ts        # TypeScript interfaces
    constants.ts    # Config values (timeouts, storage keys, etc.)
    messages.ts     # Content <-> Service Worker message types
    storage.ts      # chrome.storage.local wrapper
    webhook-client.ts  # HTTP client with retry + backoff
  popup/
    popup.html      # Extension popup UI
    popup.css       # Dark theme styles
    popup.ts        # Popup logic (settings, capture history)
  utils/            # Shared utilities
scripts/
  build.ts          # ESBuild config + static asset pipeline
  zip.ts            # Package dist/ into a zip
tests/
  unit/             # Unit tests (scraper, interceptor, spa-observer)
  integration/      # End-to-end capture flow tests
  mocks/            # Chrome API mocks for testing
  fixtures/         # HTML fixtures for DOM tests
```

## Troubleshooting

### Extension loads but doesn't capture anything

**Symptom:** You see `[LLC] Ready — interceptor and SPA observer running` in console but no captures fire when you click buttons.

**Cause:** LinkedIn sometimes lazy-loads button markup after the page appears "ready". The button's `aria-label` attributes may not be set yet when you click.

**Fix:** Wait 1-2 seconds after the page loads before clicking. If the issue persists, check Chrome DevTools console for `[LLC]` logs — if you see nothing when clicking Connect, LinkedIn likely changed their button markup. Open an issue.

### Captures fire but webhook fails

**Symptom:** Toast shows "Captured [Name]" but the popup shows status as `failed`.

**Fixes:**
1. Check your webhook URL is correct in the popup
2. Make sure your n8n workflow is **activated** (not just saved)
3. Check n8n execution logs for errors
4. Click "Retry Failed" in the popup to re-attempt

### "Could not scrape profile data" warning

**Symptom:** Toast shows `LLC: Failed to capture [action]` with a red background.

**Cause:** The DOM scraper couldn't find the expected elements. This happens when:
- LinkedIn changed their page structure (most common)
- The page wasn't fully loaded yet
- You're on an unsupported page type

**Fix:** Try refreshing the page and clicking again. If it consistently fails on a specific page type, open an issue with a screenshot of the Chrome DevTools Elements panel showing the button you clicked.

### Extension stops working after Chrome update

Chrome Manifest V3 service workers can be killed by Chrome after inactivity. The extension handles this gracefully — captures are stored locally and retried. But if the service worker doesn't restart:

1. Go to `chrome://extensions/`
2. Toggle the extension off and on
3. Refresh LinkedIn

### Duplicate captures

The extension deduplicates captures within a 60-second window (same LinkedIn URL + same action). If you're seeing duplicates beyond that window, this is by design — it captures each interaction independently.

### LinkedIn Changed Their UI (Selectors Broke)

This is the #1 maintenance issue. LinkedIn regularly changes:
- `aria-label` text on buttons
- `data-*` attribute names
- DOM hierarchy / nesting depth

**What to do:**
1. Right-click the broken button > Inspect
2. Note the current `aria-label`, `role`, and any `data-*` attributes
3. Update `src/content/selectors.ts` with the new selectors
4. Run `npm run build` and reload the extension

The selectors file is designed as the single source of truth — all changes should be made there.

## Architecture Notes

- **Non-blocking:** The extension never calls `preventDefault()` or `stopPropagation()` — LinkedIn's native actions always complete normally
- **Capture phase:** Click listener uses `{ capture: true }` to fire before LinkedIn's handlers
- **Multi-strategy fallbacks:** Every scraper has 3-4 fallback approaches for resilience
- **Exponential backoff:** Failed webhooks retry with `delay * 2^attempt` (1s, 2s, 4s)
- **No 4xx retries:** Client errors (400, 401, 403, 404) are not retried — your webhook URL is wrong
- **Local persistence:** Last 100 captures stored in `chrome.storage.local`
- **Periodic retry:** Service worker alarm retries failed captures every 5 minutes

## License

Internal use only. Do not distribute outside the team.
