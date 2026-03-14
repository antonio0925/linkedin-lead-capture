import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookClient } from '../../src/shared/webhook-client';
import type { ExtensionSettings, WebhookPayload } from '../../src/shared/types';
import { WEBHOOK_TIMEOUT_MS } from '../../src/shared/constants';

// ── Setup ────────────────────────────────────────────────────────────────

const mockPayload: WebhookPayload = {
  source: 'linkedin-lead-capture',
  version: '1.0.0',
  capturedAt: '2026-03-12T10:00:00.000Z',
  action: 'connect',
  pageType: 'profile',
  pageUrl: 'https://www.linkedin.com/in/johndoe/',
  profile: {
    fullName: 'John Doe',
    headline: 'VP of Sales at Acme Corp',
    companyName: 'Acme Corp',
    linkedinUrl: 'https://www.linkedin.com/in/johndoe/',
    profileImageUrl: 'https://media.licdn.com/photo/johndoe.jpg',
    location: 'San Francisco Bay Area',
  },
};

const baseSettings: ExtensionSettings = {
  captureEnabled: true,
  webhookUrl: 'https://hooks.example.com/webhook',
  captureConnect: true,
  captureLike: true,
  maxRetries: 3,
  retryDelayMs: 1000,
};

describe('WebhookClient', () => {
  let client: WebhookClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new WebhookClient();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends correct payload shape (method, Content-Type, body)', async () => {
    fetchMock.mockResolvedValue(new Response('OK', { status: 200 }));

    const resultPromise = client.sendToWebhook(mockPayload, baseSettings);
    // No timers needed for a successful first attempt
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/webhook');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(mockPayload);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns success on 200 response', async () => {
    fetchMock.mockResolvedValue(new Response('OK', { status: 200 }));

    const result = await client.sendToWebhook(mockPayload, baseSettings);
    expect(result).toEqual({ success: true });
  });

  it('retries on 500 with exponential backoff', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }))
      .mockResolvedValueOnce(new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const resultPromise = client.sendToWebhook(mockPayload, baseSettings);

    // First retry: delay = 1000 * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // Second retry: delay = 1000 * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries on network error (fetch throws)', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const resultPromise = client.sendToWebhook(mockPayload, baseSettings);

    // First retry delay: 1000ms
    await vi.advanceTimersByTimeAsync(1000);

    const result = await resultPromise;
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops after maxRetries and returns error', async () => {
    fetchMock.mockResolvedValue(
      new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const settings = { ...baseSettings, maxRetries: 2 };
    const resultPromise = client.sendToWebhook(mockPayload, settings);

    // attempt 0 fails, sleep 1000
    await vi.advanceTimersByTimeAsync(1000);
    // attempt 1 fails, sleep 2000
    await vi.advanceTimersByTimeAsync(2000);
    // attempt 2 fails — no more retries

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3); // 0, 1, 2
  });

  it('does NOT retry on 400 (client error)', async () => {
    fetchMock.mockResolvedValue(
      new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
    );

    const result = await client.sendToWebhook(mockPayload, baseSettings);

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does NOT retry on 422 (client error)', async () => {
    fetchMock.mockResolvedValue(
      new Response('Unprocessable', { status: 422, statusText: 'Unprocessable Entity' }),
    );

    const result = await client.sendToWebhook(mockPayload, baseSettings);

    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns error message on final failure', async () => {
    fetchMock.mockRejectedValue(new Error('DNS resolution failed'));

    const settings = { ...baseSettings, maxRetries: 0 };
    const result = await client.sendToWebhook(mockPayload, settings);

    expect(result.success).toBe(false);
    expect(result.error).toBe('DNS resolution failed');
  });

  it('returns error when no webhook URL is configured', async () => {
    const settings = { ...baseSettings, webhookUrl: '' };
    const result = await client.sendToWebhook(mockPayload, settings);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No webhook URL configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts on timeout', async () => {
    // Simulate a request that never resolves until aborted
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal!.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }),
    );

    const settings = { ...baseSettings, maxRetries: 0 };
    const resultPromise = client.sendToWebhook(mockPayload, settings);

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(WEBHOOK_TIMEOUT_MS + 100);

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});
