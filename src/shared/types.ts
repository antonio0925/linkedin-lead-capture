type CaptureAction = 'connect' | 'like' | 'message_sent' | 'comment' | 'repost' | 'inmail_sent';
type LinkedInPageType = 'profile' | 'feed' | 'search' | 'company' | 'unknown';

interface ProfileData {
  fullName: string;
  headline: string;
  companyName: string;
  linkedinUrl: string;
  profileImageUrl: string;
  location?: string;
  connectionDegree?: string;
}

interface CaptureEvent {
  id: string;
  timestamp: string;
  action: CaptureAction;
  profile: ProfileData;
  pageType: LinkedInPageType;
  pageUrl: string;
  webhookStatus: 'pending' | 'sent' | 'failed' | 'retrying';
  webhookAttempts: number;
  webhookLastError?: string;
}

interface ExtensionSettings {
  captureEnabled: boolean;
  webhookUrl: string;
  captureConnect: boolean;
  captureLike: boolean;
  captureMessage: boolean;
  captureComment: boolean;
  captureRepost: boolean;
  captureInmail: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

interface WebhookPayload {
  source: 'linkedin-lead-capture';
  version: string;
  capturedAt: string;
  action: CaptureAction;
  pageType: LinkedInPageType;
  pageUrl: string;
  profile: ProfileData;
}

export type {
  CaptureAction,
  LinkedInPageType,
  ProfileData,
  CaptureEvent,
  ExtensionSettings,
  WebhookPayload,
};
