import type { CodexMeterConfig, CodexStatus, NotificationDecision, NotificationReason } from './types';

export function formatLocalTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

export function isStale(status: CodexStatus, now = new Date(), maxAgeMinutes = 30): boolean {
  const fetched = new Date(status.fetchedAt);
  if (Number.isNaN(fetched.getTime())) return true;
  return now.getTime() - fetched.getTime() > maxAgeMinutes * 60_000;
}

export function quotaColor(status: CodexStatus, threshold = 20): 'green' | 'yellow' | 'red' | 'gray' {
  if (!status.ok) return 'gray';
  if (status.remainingPercent < threshold) return 'red';
  if (status.remainingPercent <= 50) return 'yellow';
  return 'green';
}

export function formatStatusTooltip(status: CodexStatus, now = new Date()): string {
  const staleSuffix = isStale(status, now) ? ' (stale)' : '';
  const updated = formatLocalTime(status.fetchedAt);
  if (!status.ok) {
    return `Codex: ${status.error}${staleSuffix}\nUpdated: ${updated}`;
  }
  const reset = status.resetText ? `\nReset: ${status.resetText}` : '';
  return `Codex: ${status.remainingText}${staleSuffix}${reset}\nUpdated: ${updated}`;
}

export function shouldNotify(
  previous: CodexStatus | null | undefined,
  next: CodexStatus,
  config: CodexMeterConfig,
  manual = false,
): NotificationDecision {
  const reasons: NotificationReason[] = [];
  if (manual) reasons.push('manual');
  if (config.discord.notifyEveryRefresh && next.ok) reasons.push('every_refresh');

  if (next.ok) {
    if (!previous?.ok && config.discord.notifyOnRecovery) reasons.push('recovered');
    if (next.remainingPercent < config.lowThresholdPercent && config.discord.notifyOnLowQuota) {
      const wasAlreadyLow = previous?.ok && previous.remainingPercent < config.lowThresholdPercent;
      if (!wasAlreadyLow) reasons.push('low_quota');
    }
  } else if (previous?.ok !== false && config.discord.notifyOnFetchFailure) {
    reasons.push('fetch_failed');
  }

  return { notify: reasons.length > 0, reasons };
}

export function humanSummary(status: CodexStatus): string {
  if (!status.ok) return `查詢失敗：${status.error}`;
  const reset = status.resetText ? `，重置：${status.resetText}` : '';
  return `Codex 剩餘：${status.remainingPercent}%${reset}，最後更新：${formatLocalTime(status.fetchedAt)}`;
}
