import type { ExtensionSettings, WebhookPayload } from './types';
import { WEBHOOK_TIMEOUT_MS } from './constants';

interface WebhookResult {
  success: boolean;
  error?: string;
}

export class WebhookClient {
  async sendToWebhook(
    payload: WebhookPayload,
    settings: ExtensionSettings,
  ): Promise<WebhookResult> {
    const { webhookUrl, maxRetries, retryDelayMs } = settings;

    if (!webhookUrl) {
      return { success: false, error: 'No webhook URL configured' };
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.attemptSend(webhookUrl, payload);
        if (result.success) return result;

        // Do not retry on 4xx client errors
        if (result.statusCode && result.statusCode >= 400 && result.statusCode < 500) {
          return { success: false, error: `Client error: ${result.statusCode}` };
        }

        // Retry on 5xx or network errors if we have attempts left
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= maxRetries) {
          return { success: false, error: message };
        }
        const delay = retryDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  private async attemptSend(
    url: string,
    payload: WebhookPayload,
  ): Promise<WebhookResult & { statusCode?: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        return { success: true };
      }

      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Webhook request timed out after ${WEBHOOK_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
