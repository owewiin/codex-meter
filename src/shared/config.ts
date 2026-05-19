import type { CodexMeterConfig } from './types';

export const DEFAULT_CONFIG: CodexMeterConfig = {
  usagePageUrl: 'https://chatgpt.com/',
  refreshIntervalMinutes: 15,
  lowThresholdPercent: 20,
  discord: {
    enabled: false,
    webhookUrl: '',
    notifyOnLowQuota: true,
    notifyOnFetchFailure: true,
    notifyOnRecovery: true,
    notifyEveryRefresh: false,
  },
  notifications: {
    windowsLowQuota: true,
    windowsFetchFailure: true,
    windowsRecovery: true,
  },
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeConfig(input: Partial<CodexMeterConfig> | null | undefined): CodexMeterConfig {
  const raw = input ?? {};
  const discord = raw.discord ?? DEFAULT_CONFIG.discord;
  const notifications = raw.notifications ?? DEFAULT_CONFIG.notifications;

  return {
    usagePageUrl: stringOr(raw.usagePageUrl, DEFAULT_CONFIG.usagePageUrl),
    refreshIntervalMinutes: clampNumber(raw.refreshIntervalMinutes, DEFAULT_CONFIG.refreshIntervalMinutes, 5, 240),
    lowThresholdPercent: clampNumber(raw.lowThresholdPercent, DEFAULT_CONFIG.lowThresholdPercent, 1, 100),
    discord: {
      enabled: boolOr(discord.enabled, DEFAULT_CONFIG.discord.enabled),
      webhookUrl: typeof discord.webhookUrl === 'string' ? discord.webhookUrl.trim() : '',
      notifyOnLowQuota: boolOr(discord.notifyOnLowQuota, true),
      notifyOnFetchFailure: boolOr(discord.notifyOnFetchFailure, true),
      notifyOnRecovery: boolOr(discord.notifyOnRecovery, true),
      notifyEveryRefresh: boolOr(discord.notifyEveryRefresh, false),
    },
    notifications: {
      windowsLowQuota: boolOr(notifications.windowsLowQuota, true),
      windowsFetchFailure: boolOr(notifications.windowsFetchFailure, true),
      windowsRecovery: boolOr(notifications.windowsRecovery, true),
    },
  };
}
