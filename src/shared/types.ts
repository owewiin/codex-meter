export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  notifyOnLowQuota: boolean;
  notifyOnFetchFailure: boolean;
  notifyOnRecovery: boolean;
  notifyEveryRefresh: boolean;
}

export interface NotificationConfig {
  windowsLowQuota: boolean;
  windowsFetchFailure: boolean;
  windowsRecovery: boolean;
}

export interface CodexMeterConfig {
  usagePageUrl: string;
  refreshIntervalMinutes: number;
  lowThresholdPercent: number;
  discord: DiscordConfig;
  notifications: NotificationConfig;
}

export interface SuccessfulCodexStatus {
  ok: true;
  source: 'chatgpt_web' | 'fixture';
  remainingText: string;
  remainingPercent: number;
  resetText?: string;
  planText?: string;
  fetchedAt: string;
  usagePageUrl?: string;
  rawText?: string;
}

export interface FailedCodexStatus {
  ok: false;
  source: 'chatgpt_web' | 'fixture';
  errorCode: 'LOGIN_REQUIRED' | 'PARSER_NO_MATCH' | 'NETWORK_ERROR' | 'WORKER_ERROR' | 'UNKNOWN_ERROR';
  error: string;
  fetchedAt: string;
  usagePageUrl?: string;
  rawText?: string;
}

export type CodexStatus = SuccessfulCodexStatus | FailedCodexStatus;

export type NotificationReason = 'low_quota' | 'fetch_failed' | 'recovered' | 'every_refresh' | 'manual';

export interface NotificationDecision {
  notify: boolean;
  reasons: NotificationReason[];
}
