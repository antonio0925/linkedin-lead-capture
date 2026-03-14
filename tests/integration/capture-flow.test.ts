import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { resetMockStorage, getSentMessages } from '../mocks/chrome-api';
import { scrapeProfile } from '../../src/content/scraper';
import { startInterceptor } from '../../src/content/interceptor';
import type { CaptureAction, ProfileData, WebhookPayload } from '../../src/shared/types';
import { EXTENSION_SOURCE, EXTENSION_VERSION } from '../../src/shared/constants';
import { WebhookClient } from '../../src/shared/webhook-client';

// ── Helpers ──────────────────────────────────────────────────────────────

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, '..', 'fixtures', name), 'utf-8');
}

function setDOM(html: string): void {
  document.documentElement.innerHTML = html;
}

// ── Integration: full capture flow ───────────────────────────────────────

describe('integration — capture flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let interceptorCleanup: () => void;

  beforeEach(() => {
    resetMockStorage();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    // Load profile page fixture
    setDOM(loadFixture('profile-page.html'));

    // Fake a profile URL
    Object.defineProperty(window, 'location', {
      value: { href: 'https://www.linkedin.com/in/johndoe/' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    interceptorCleanup?.();
    vi.restoreAllMocks();
  });

  it('end-to-end: Connect click -> scrape -> message -> webhook', async () => {
    // ── Step 1: Wire up interceptor that scrapes + sends a message ────
    let capturedProfile: ProfileData | null = null;

    interceptorCleanup = startInterceptor(
      (action: CaptureAction, element: HTMLElement) => {
        // Scrape from the profile page
        capturedProfile = scrapeProfile({
          action,
          element,
          pageType: 'profile',
        });

        if (capturedProfile) {
          const captureEvent = {
            type: 'CAPTURE_EVENT' as const,
            payload: {
              id: 'test-capture-1',
              timestamp: new Date().toISOString(),
              action,
              profile: capturedProfile,
              pageType: 'profile' as const,
              pageUrl: window.location.href,
              webhookStatus: 'pending' as const,
              webhookAttempts: 0,
            },
          };
          chrome.runtime.sendMessage(captureEvent);
        }
      },
      () => true, // always enabled
    );

    // ── Step 2: Click the Connect button ──────────────────────────────
    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    expect(connectBtn).not.toBeNull();

    connectBtn.click();

    // ── Step 3: Verify scraper output ─────────────────────────────────
    expect(capturedProfile).not.toBeNull();
    expect(capturedProfile!.fullName).toBe('John Doe');
    expect(capturedProfile!.headline).toBe('VP of Sales at Acme Corp');
    expect(capturedProfile!.companyName).toBe('Acme Corp');
    expect(capturedProfile!.linkedinUrl).toContain('/in/johndoe/');
    expect(capturedProfile!.profileImageUrl).toBe('https://media.licdn.com/photo/johndoe.jpg');

    // ── Step 4: Verify chrome.runtime.sendMessage was called ──────────
    const messages = getSentMessages();
    expect(messages.length).toBe(1);

    const sent = messages[0].message as { type: string; payload: Record<string, unknown> };
    expect(sent.type).toBe('CAPTURE_EVENT');
    expect(sent.payload.action).toBe('connect');
    expect(sent.payload.pageType).toBe('profile');
    expect((sent.payload.profile as ProfileData).fullName).toBe('John Doe');

    // ── Step 5: Trigger webhook send and verify payload shape ─────────
    fetchMock.mockResolvedValue(new Response('OK', { status: 200 }));

    const webhookPayload: WebhookPayload = {
      source: EXTENSION_SOURCE,
      version: EXTENSION_VERSION,
      capturedAt: new Date().toISOString(),
      action: 'connect',
      pageType: 'profile',
      pageUrl: 'https://www.linkedin.com/in/johndoe/',
      profile: capturedProfile!,
    };

    const client = new WebhookClient();
    const result = await client.sendToWebhook(webhookPayload, {
      captureEnabled: true,
      webhookUrl: 'https://hooks.example.com/webhook',
      captureConnect: true,
      captureLike: true,
      maxRetries: 3,
      retryDelayMs: 1000,
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    // Verify the fetch call's payload matches WebhookPayload interface
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/webhook');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body) as WebhookPayload;
    expect(body.source).toBe('linkedin-lead-capture');
    expect(body.version).toBe(EXTENSION_VERSION);
    expect(body.action).toBe('connect');
    expect(body.pageType).toBe('profile');
    expect(body.profile.fullName).toBe('John Doe');
    expect(body.profile.companyName).toBe('Acme Corp');
    expect(body.profile.linkedinUrl).toContain('/in/johndoe/');
  });

  it('does not send message when scraper returns null (no name)', () => {
    // Clear the name so scraper returns null
    const h1 = document.querySelector('main h1')!;
    h1.textContent = '';

    let messageSent = false;

    interceptorCleanup = startInterceptor(
      (action: CaptureAction, element: HTMLElement) => {
        const profile = scrapeProfile({
          action,
          element,
          pageType: 'profile',
        });

        if (profile) {
          chrome.runtime.sendMessage({ type: 'CAPTURE_EVENT', payload: profile });
          messageSent = true;
        }
      },
      () => true,
    );

    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    connectBtn.click();

    expect(messageSent).toBe(false);
    expect(getSentMessages().length).toBe(0);
  });

  it('end-to-end: message send click -> scrape messaging -> CAPTURE_EVENT', () => {
    // ── Load messaging page fixture ────────────────────────────────
    setDOM(loadFixture('messaging-page.html'));

    let capturedProfile: ProfileData | null = null;

    interceptorCleanup = startInterceptor(
      (action: CaptureAction, element: HTMLElement) => {
        // message_sent action triggers scrapeFromMessaging via scrapeProfile
        capturedProfile = scrapeProfile({
          action,
          element,
          pageType: 'feed', // pageType is overridden by action for message_sent
        });

        if (capturedProfile) {
          const captureEvent = {
            type: 'CAPTURE_EVENT' as const,
            payload: {
              id: 'test-capture-msg-1',
              timestamp: new Date().toISOString(),
              action,
              profile: capturedProfile,
              pageType: 'feed' as const,
              pageUrl: window.location.href,
              webhookStatus: 'pending' as const,
              webhookAttempts: 0,
            },
          };
          chrome.runtime.sendMessage(captureEvent);
        }
      },
      () => true,
    );

    // ── Click the Send button ──────────────────────────────────────
    const sendBtn = document.querySelector('.msg-form__send-button') as HTMLElement;
    expect(sendBtn).not.toBeNull();

    sendBtn.click();

    // ── Verify scraper extracted recipient data ────────────────────
    expect(capturedProfile).not.toBeNull();
    expect(capturedProfile!.fullName).toBe('Jane Doe');
    expect(capturedProfile!.headline).toBe('Head of Growth at TechCorp');
    expect(capturedProfile!.companyName).toBe('TechCorp');
    expect(capturedProfile!.linkedinUrl).toContain('/in/janedoe/');

    // ── Verify CAPTURE_EVENT message sent with action=message_sent ─
    const messages = getSentMessages();
    expect(messages.length).toBe(1);

    const sent = messages[0].message as { type: string; payload: Record<string, unknown> };
    expect(sent.type).toBe('CAPTURE_EVENT');
    expect(sent.payload.action).toBe('message_sent');
    expect((sent.payload.profile as ProfileData).fullName).toBe('Jane Doe');
  });

  it('interceptor ignores clicks when disabled', () => {
    interceptorCleanup = startInterceptor(
      () => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_EVENT', payload: {} });
      },
      () => false, // disabled
    );

    const connectBtn = document.querySelector(
      'button[aria-label*="connect" i]',
    ) as HTMLElement;
    connectBtn.click();

    expect(getSentMessages().length).toBe(0);
  });
});
