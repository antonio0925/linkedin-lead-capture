/**
 * DOM scraper — extracts ProfileData from the current page.
 *
 * Three strategies based on pageType:
 *   profile  – reads the main profile card
 *   feed     – walks up from the clicked element to the post card
 *   search   – walks up to the search result container
 */

import type { CaptureAction, LinkedInPageType, ProfileData } from '../shared/types';
import { SELECTORS } from './selectors';

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Try each selector in order against `root`; return the first element found.
 */
function queryFirst(root: Element | Document, selectors: string | string[]): Element | null {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Trim and collapse whitespace */
function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Walk up the DOM from `start` looking for an ancestor that matches `selector`.
 * Stops after `maxLevels` hops.
 */
function closest(start: HTMLElement, selector: string, maxLevels = 15): HTMLElement | null {
  let el: HTMLElement | null = start;
  for (let i = 0; i < maxLevels && el; i++) {
    if (el.matches(selector)) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Best-effort company extraction from a headline string.
 * LinkedIn headlines often follow the pattern "Title at Company" or "Title | Company".
 */
function parseCompanyFromHeadline(headline: string): string {
  // Try common separators: " at ", " @ ", " | "
  for (const sep of [' at ', ' @ ', ' | ']) {
    const idx = headline.lastIndexOf(sep);
    if (idx !== -1) {
      return headline.slice(idx + sep.length).trim();
    }
  }
  return '';
}

/**
 * Normalise a LinkedIn profile URL: strip query params / hash, ensure https.
 */
function normalizeLinkedInUrl(raw: string): string {
  try {
    const url = new URL(raw, 'https://www.linkedin.com');
    // Extract just /in/slug/ — strip overlay paths, query params, etc.
    const match = url.pathname.match(/\/in\/([\w-]+)/);
    if (match) {
      return `https://www.linkedin.com/in/${match[1]}/`;
    }
    return `https://www.linkedin.com${url.pathname.replace(/\/+$/, '/')}`;
  } catch {
    return raw;
  }
}

// ─── Extraction strategies ────────────────────────────────────────────

interface ScrapeContext {
  action: CaptureAction;
  element: HTMLElement;
  pageType: LinkedInPageType;
}

/** Returns true if the text looks like mutual connections noise, not a real headline */
function isGarbageHeadline(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('mutual connection') ||
    lower.includes('other mutual') ||
    /^\d+ (follower|connection)/.test(lower) ||
    lower.startsWith('people also viewed');
}

function scrapeFromProfile(): ProfileData | null {
  const s = SELECTORS.profilePage;

  const nameEl = queryFirst(document, s.name);
  const fullName = clean(nameEl?.textContent);
  if (!fullName) return null;

  let headlineEl = queryFirst(document, s.headline);
  let headline = clean(headlineEl?.textContent);

  // Reject garbage text (mutual connections, follower counts, etc.)
  if (!headline || isGarbageHeadline(headline)) {
    headlineEl = queryFirst(document, s.headlineFallback);
    headline = clean(headlineEl?.textContent);
  }
  if (isGarbageHeadline(headline)) {
    headline = '';
  }

  const imgEl = queryFirst(document, s.profileImage) as HTMLImageElement | null;
  const profileImageUrl = imgEl?.src ?? '';

  const locEl = queryFirst(document, s.location);
  const location = clean(locEl?.textContent);

  const degreeEl = queryFirst(document, s.connectionDegree);
  const connectionDegree = clean(degreeEl?.textContent);

  // Company: try the experience section first, fall back to headline parsing
  const companyEl = queryFirst(document, s.experienceCompany);
  const companyName = clean(companyEl?.textContent) || parseCompanyFromHeadline(headline);

  const linkedinUrl = normalizeLinkedInUrl(window.location.href);
  if (!linkedinUrl.includes('/in/')) return null;

  return { fullName, headline, companyName, linkedinUrl, profileImageUrl, location, connectionDegree };
}

function scrapeFromFeed(element: HTMLElement): ProfileData | null {
  const s = SELECTORS.feedCard;

  // ── Step 1: Find the post container ──
  // Walk up aggressively — try multiple container patterns
  const root = findFeedPostRoot(element);

  // ── Step 2: Find the first /in/ profile link in the container ──
  // This is the most reliable signal — LinkedIn ALWAYS links the author name to /in/
  const profileLinks = root.querySelectorAll('a[href*="/in/"]');

  let bestLink: HTMLAnchorElement | null = null;
  let fullName = '';
  let linkedinUrl = '';

  // Try each /in/ link — pick the first one with visible text (that's usually the author)
  for (const link of profileLinks) {
    const anchor = link as HTMLAnchorElement;
    // Skip links explicitly hidden via display:none (but not JSDOM zero-size defaults)
    if (anchor.style.display === 'none' || anchor.hidden) continue;

    // Get name: prefer span[aria-hidden="true"] (LinkedIn's pattern), else use link text
    const nameSpan = anchor.querySelector('span[aria-hidden="true"]');
    const candidateName = clean(nameSpan?.textContent) || clean(anchor.textContent);

    // Skip empty or very short names (likely not real names)
    if (candidateName && candidateName.length > 2 && !candidateName.startsWith('http')) {
      bestLink = anchor;
      fullName = candidateName;
      linkedinUrl = normalizeLinkedInUrl(anchor.href);
      break;
    }
  }

  // ── Step 3: Standard selectors as fallback (in case /in/ links failed) ──
  if (!fullName) {
    const nameEl = queryFirst(root, s.actorName);
    fullName = clean(nameEl?.textContent);
  }

  if (!fullName) {
    console.warn('[LLC] Feed scraper — no name found in container with', profileLinks.length, '/in/ links');
    return null;
  }

  // ── Step 4: Headline ──
  let headline = '';
  const headlineEl = queryFirst(root, s.actorHeadline);
  headline = clean(headlineEl?.textContent);

  if (!headline) {
    // Nuclear headline: look for any span[aria-hidden] near the name that ISN'T the name
    const allHidden = root.querySelectorAll('span[aria-hidden="true"]');
    for (const span of allHidden) {
      const text = clean(span.textContent);
      if (text && text !== fullName && text.length > 5 && !text.startsWith('http')) {
        headline = text;
        break;
      }
    }
  }

  if (!headline) {
    const descEl = root.querySelector('[class*="description"] span[aria-hidden="true"], [class*="subtitle"]');
    headline = clean(descEl?.textContent);
  }

  // ── Step 5: Profile image ──
  const imgEl = (queryFirst(root, s.actorImage) ??
    root.querySelector('img[alt*="photo" i], img[alt*="profile" i]')) as HTMLImageElement | null;
  const profileImageUrl = imgEl?.src ?? '';

  if (!linkedinUrl && bestLink) {
    linkedinUrl = normalizeLinkedInUrl(bestLink.href);
  }

  const companyName = parseCompanyFromHeadline(headline);

  return { fullName, headline, companyName, linkedinUrl, profileImageUrl };
}

/**
 * Walk up from the clicked element to find the feed post container.
 * Tries multiple strategies — data-urn, data-id, article, or just goes up 20 levels.
 */
function findFeedPostRoot(element: HTMLElement): Element | Document {
  // Strategy 1: [data-urn] container (most common)
  const urnContainer = closest(element, '[data-urn]', 20);
  if (urnContainer) return urnContainer;

  // Strategy 2: [data-id] container
  const dataIdContainer = closest(element, '[data-id]', 20);
  if (dataIdContainer) return dataIdContainer;

  // Strategy 3: any <article> ancestor
  const article = closest(element, 'article', 20);
  if (article) return article;

  // Strategy 4: walk up to a "large" container (one that has /in/ links inside it)
  let el: HTMLElement | null = element;
  for (let i = 0; i < 25 && el; i++) {
    if (el.querySelector('a[href*="/in/"]')) {
      return el;
    }
    el = el.parentElement;
  }

  return document;
}

function scrapeFromSearch(element: HTMLElement): ProfileData | null {
  const s = SELECTORS.searchResult;

  const card = closest(element, s.resultCard);
  const root = card ?? document;

  const nameEl = queryFirst(root, s.name);
  const fullName = clean(nameEl?.textContent);
  if (!fullName) return null;

  const headlineEl = queryFirst(root, s.headline);
  const headline = clean(headlineEl?.textContent);

  const linkEl = queryFirst(root, s.profileLink) as HTMLAnchorElement | null;
  const linkedinUrl = linkEl ? normalizeLinkedInUrl(linkEl.href) : '';
  if (!linkedinUrl) return null;

  const imgEl = queryFirst(root, s.profileImage) as HTMLImageElement | null;
  const profileImageUrl = imgEl?.src ?? '';

  const companyName = parseCompanyFromHeadline(headline);

  return { fullName, headline, companyName, linkedinUrl, profileImageUrl };
}

// ─── Messaging panel scraper (message_sent / inmail_sent) ─────────────

function scrapeFromMessaging(element: HTMLElement): ProfileData | null {
  const s = SELECTORS.messagingPanel;

  // Walk up to the messaging panel/overlay container
  const panel =
    closest(element, '.msg-overlay-conversation-bubble', 20) ??
    closest(element, '.msg-convo-wrapper', 20) ??
    closest(element, '[data-control-name*="overlay"]', 20);
  const root = panel ?? document;

  // Reject common false-positive names from LinkedIn messaging UI
  const GARBAGE_NAMES = ['new message', 'messaging', 'compose', 'write a message', 'start a conversation'];

  // Strategy 1: standard selectors
  const nameEl = queryFirst(root, s.participantName);
  let fullName = clean(nameEl?.textContent);
  if (GARBAGE_NAMES.includes(fullName.toLowerCase())) fullName = '';

  // Strategy 2: find the /in/ profile link and extract name from it
  let linkEl = queryFirst(root, s.profileLink) as HTMLAnchorElement | null;
  if (!linkEl) {
    linkEl = root.querySelector('a[href*="/in/"]') as HTMLAnchorElement | null;
  }
  const linkedinUrl = linkEl ? normalizeLinkedInUrl(linkEl.href) : '';

  if (!fullName && linkEl) {
    const nameSpan = linkEl.querySelector('span[aria-hidden="true"]') ?? linkEl;
    const candidate = clean(nameSpan?.textContent);
    if (candidate && !GARBAGE_NAMES.includes(candidate.toLowerCase())) {
      fullName = candidate;
    }
  }

  // Strategy 3: derive name from LinkedIn URL slug (e.g. joshuamaltz → Joshua Maltz)
  if (!fullName && linkedinUrl) {
    const slugMatch = linkedinUrl.match(/\/in\/([^/]+)/);
    if (slugMatch) {
      // Convert slug like "joshua-maltz-123abc" to "Joshua Maltz"
      fullName = slugMatch[1]
        .replace(/-?\d+[a-z]*$/i, '') // strip trailing ID
        .split('-')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  if (!fullName) return null;

  const headlineEl = queryFirst(root, s.participantHeadline);
  const headline = clean(headlineEl?.textContent);

  const companyName = parseCompanyFromHeadline(headline);

  return { fullName, headline, companyName, linkedinUrl, profileImageUrl: '' };
}

// ─── Public API ───────────────────────────────────────────────────────

export function scrapeProfile(context: ScrapeContext): ProfileData | null {
  try {
    // Message / InMail actions always use the messaging panel scraper
    if (context.action === 'message_sent' || context.action === 'inmail_sent') {
      return scrapeFromMessaging(context.element);
    }

    // Comment and repost happen in the feed — use the feed card scraper
    if (context.action === 'comment' || context.action === 'repost') {
      return scrapeFromFeed(context.element);
    }

    switch (context.pageType) {
      case 'profile':
        return scrapeFromProfile();
      case 'feed':
        return scrapeFromFeed(context.element);
      case 'search':
        return scrapeFromSearch(context.element);
      default:
        // company pages and unknown — attempt profile-style scrape as fallback
        return scrapeFromProfile();
    }
  } catch (err) {
    console.error('[LLC] scraper error:', err);
    return null;
  }
}
