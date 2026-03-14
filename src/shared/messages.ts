import type { CaptureEvent, ExtensionSettings } from './types';

// Content script -> Service worker messages
type ContentMessage =
  | { type: 'CAPTURE_EVENT'; payload: CaptureEvent }
  | { type: 'GET_SETTINGS' }
  | { type: 'RETRY_FAILED' };

// Service worker -> Content script responses
type ServiceWorkerResponse =
  | { type: 'SETTINGS'; payload: ExtensionSettings }
  | { type: 'ACK'; success: boolean };

export type { ContentMessage, ServiceWorkerResponse };
