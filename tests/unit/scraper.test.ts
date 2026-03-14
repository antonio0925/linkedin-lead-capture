import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scrapeProfile } from '../../src/content/scraper';
import type { CaptureAction, LinkedInPageType } from '../../src/shared/types';

// ── Helpers ──────────────────────────────────────────────────────────────

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', name), 'utf-8');
}

function setDOM(html: string): void {
  document.documentElement.innerHTML = html;
}

function makeContext(
  pageType: LinkedInPageType,
  action: CaptureAction = 'connect',
  element?: HTMLElement,
) {
  return {
    action,
    pageType,
    element: element ?? document.body,
  };
}

// ── Profile page ─────────────────────────────────────────────────────────

describe('scraper — profile page', () => {
  beforeEach(() => {
    setDOM(loadFixture('profile-page.html'));
    // scrapeFromProfile uses window.location.href — fake a profile URL
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.linkedin.com/in/johndoe/' },
      writable: true,
    });
  });

  it('extracts fullName from h1', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data).not.toBeNull();
    expect(data!.fullName).toBe('John Doe');
  });

  it('extracts headline', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data!.headline).toBe('VP of Sales at Acme Corp');
  });

  it('extracts profileImageUrl', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data!.profileImageUrl).toBe('https://media.licdn.com/photo/johndoe.jpg');
  });

  it('extracts location', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data!.location).toBe('San Francisco Bay Area');
  });

  it('extracts connectionDegree', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data!.connectionDegree).toBe('2nd');
  });

  it('extracts companyName from experience section', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data!.companyName).toBe('Acme Corp');
  });

  it('normalizes the linkedinUrl', () => {
    const data = scrapeProfile(makeContext('profile'));
    expect(data!.linkedinUrl).toMatch(/^https:\/\/www\.linkedin\.com\/in\/johndoe\//);
  });

  it('parses company from headline when experience section is missing', () => {
    // Remove the experience section
    const exp = document.querySelector('#experience');
    const container = document.querySelector('.pvs-list__outer-container');
    exp?.remove();
    container?.remove();

    const data = scrapeProfile(makeContext('profile'));
    expect(data).not.toBeNull();
    // Falls back to parseCompanyFromHeadline
    expect(data!.companyName).toBe('Acme Corp');
  });

  it('returns null when name is missing', () => {
    const h1 = document.querySelector('main h1')!;
    h1.textContent = '';
    const data = scrapeProfile(makeContext('profile'));
    expect(data).toBeNull();
  });

  it('returns null when URL is not a profile URL', () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.linkedin.com/feed/' },
      writable: true,
    });
    const data = scrapeProfile(makeContext('profile'));
    expect(data).toBeNull();
  });

  it('handles missing optional fields gracefully', () => {
    // Remove location and degree elements
    document.querySelector('.text-body-small')?.remove();
    document.querySelector('.dist-value')?.remove();

    const data = scrapeProfile(makeContext('profile'));
    expect(data).not.toBeNull();
    expect(data!.location).toBe('');
    expect(data!.connectionDegree).toBe('');
  });
});

// ── Feed page ────────────────────────────────────────────────────────────

describe('scraper — feed page', () => {
  beforeEach(() => {
    setDOM(loadFixture('feed-page.html'));
  });

  it('extracts actor name from post card', () => {
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    expect(data).not.toBeNull();
    expect(data!.fullName).toBe('Jane Smith');
  });

  it('extracts actor headline', () => {
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    expect(data!.headline).toBe('Head of Marketing at Globex Inc');
  });

  it('extracts actor linkedin URL', () => {
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    expect(data!.linkedinUrl).toContain('/in/janedoe/');
  });

  it('extracts actor image', () => {
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    expect(data!.profileImageUrl).toBe('https://media.licdn.com/photo/janesmith.jpg');
  });

  it('parses company from actor headline', () => {
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    expect(data!.companyName).toBe('Globex Inc');
  });

  it('returns null when actor name is missing', () => {
    const nameSpan = document.querySelector(
      'a[data-control-name="actor"] span[aria-hidden="true"]',
    )!;
    nameSpan.textContent = '';
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    expect(data).toBeNull();
  });

  it('returns profile without URL when actor link is missing (index.ts fills it)', () => {
    const link = document.querySelector('a[data-control-name="actor"]')!;
    link.removeAttribute('href');
    // Also remove any other /in/ links so no fallback
    document.querySelectorAll('a[href*="/in/"]').forEach((a) => a.remove());
    const likeBtn = document.querySelector('button[aria-label*="Like"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'like', likeBtn));
    // Scraper now returns the profile even without URL — index.ts fallback fills it
    expect(data).not.toBeNull();
    expect(data!.fullName).toBeTruthy();
    expect(data!.linkedinUrl).toBe('');
  });
});

// ── Messaging page ──────────────────────────────────────────────────

describe('scraper — messaging page', () => {
  beforeEach(() => {
    setDOM(loadFixture('messaging-page.html'));
  });

  it('extracts recipient name from conversation header', () => {
    const sendBtn = document.querySelector('.msg-form__send-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'message_sent', sendBtn));
    expect(data).not.toBeNull();
    expect(data!.fullName).toBe('Jane Doe');
  });

  it('extracts LinkedIn URL from conversation header profile link', () => {
    const sendBtn = document.querySelector('.msg-form__send-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'message_sent', sendBtn));
    expect(data).not.toBeNull();
    expect(data!.linkedinUrl).toContain('/in/janedoe/');
  });

  it('extracts headline from subtitle', () => {
    const sendBtn = document.querySelector('.msg-form__send-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'message_sent', sendBtn));
    expect(data).not.toBeNull();
    expect(data!.headline).toBe('Head of Growth at TechCorp');
  });

  it('parses company from headline', () => {
    const sendBtn = document.querySelector('.msg-form__send-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'message_sent', sendBtn));
    expect(data).not.toBeNull();
    expect(data!.companyName).toBe('TechCorp');
  });

  it('returns null when no profile link found', () => {
    // Remove the profile link from the header
    const link = document.querySelector('.msg-overlay-bubble-header a[href*="/in/"]');
    link?.remove();
    // Also remove the title text so the name selector fails
    const titleEl = document.querySelector('h2.msg-overlay-bubble-header__title');
    if (titleEl) titleEl.textContent = '';

    const sendBtn = document.querySelector('.msg-form__send-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'message_sent', sendBtn));
    expect(data).toBeNull();
  });
});

// ── Comment / Repost (feed card scraper) ────────────────────────────────

describe('scraper — comment action', () => {
  beforeEach(() => {
    setDOM(loadFixture('feed-comment.html'));
  });

  it('extracts post author from feed card on comment action', () => {
    const commentBtn = document.querySelector('.comments-comment-box__submit-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'comment', commentBtn));
    expect(data).not.toBeNull();
    expect(data!.fullName).toBe('Bob Smith');
  });

  it('extracts post author headline on comment action', () => {
    const commentBtn = document.querySelector('.comments-comment-box__submit-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'comment', commentBtn));
    expect(data).not.toBeNull();
    expect(data!.headline).toBe('CTO at StartupXYZ');
  });

  it('extracts post author company on comment action', () => {
    const commentBtn = document.querySelector('.comments-comment-box__submit-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'comment', commentBtn));
    expect(data).not.toBeNull();
    expect(data!.companyName).toBe('StartupXYZ');
  });

  it('extracts post author LinkedIn URL on comment action', () => {
    const commentBtn = document.querySelector('.comments-comment-box__submit-button') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'comment', commentBtn));
    expect(data).not.toBeNull();
    expect(data!.linkedinUrl).toContain('/in/bobsmith/');
  });
});

describe('scraper — repost action', () => {
  beforeEach(() => {
    setDOM(loadFixture('feed-comment.html'));
  });

  it('extracts post author from feed card on repost action', () => {
    const repostBtn = document.querySelector('button[aria-label*="Repost"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'repost', repostBtn));
    expect(data).not.toBeNull();
    expect(data!.fullName).toBe('Bob Smith');
  });

  it('extracts post author headline on repost action', () => {
    const repostBtn = document.querySelector('button[aria-label*="Repost"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'repost', repostBtn));
    expect(data).not.toBeNull();
    expect(data!.headline).toBe('CTO at StartupXYZ');
  });

  it('extracts post author LinkedIn URL on repost action', () => {
    const repostBtn = document.querySelector('button[aria-label*="Repost"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'repost', repostBtn));
    expect(data).not.toBeNull();
    expect(data!.linkedinUrl).toContain('/in/bobsmith/');
  });

  it('extracts post author image on repost action', () => {
    const repostBtn = document.querySelector('button[aria-label*="Repost"]') as HTMLElement;
    const data = scrapeProfile(makeContext('feed', 'repost', repostBtn));
    expect(data).not.toBeNull();
    expect(data!.profileImageUrl).toBe('https://media.licdn.com/photo/bobsmith.jpg');
  });
});

// ── Search results page ──────────────────────────────────────────────────

describe('scraper — search results page', () => {
  beforeEach(() => {
    setDOM(loadFixture('search-results.html'));
  });

  it('extracts name from search result card', () => {
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data).not.toBeNull();
    expect(data!.fullName).toBe('Bob Jones');
  });

  it('extracts headline from search result', () => {
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data!.headline).toBe('CTO at StartupXYZ');
  });

  it('extracts linkedin URL from search result', () => {
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data!.linkedinUrl).toContain('/in/bobjones/');
  });

  it('extracts profile image from search result', () => {
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data!.profileImageUrl).toBe('https://media.licdn.com/photo/bobjones.jpg');
  });

  it('parses company from headline', () => {
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data!.companyName).toBe('StartupXYZ');
  });

  it('returns null when name is missing', () => {
    const span = document.querySelector('a[href*="/in/"] span[aria-hidden="true"]')!;
    span.textContent = '';
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data).toBeNull();
  });

  it('returns null when profile link is missing', () => {
    document.querySelectorAll('a[href*="/in/"]').forEach((a) => a.remove());
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    const data = scrapeProfile(makeContext('search', 'connect', connectBtn));
    expect(data).toBeNull();
  });
});
