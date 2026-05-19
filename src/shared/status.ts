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
  const percent = status.remainingPercent;
  if (percent < threshold) return 'red';
  if (percent <= 50) return 'yellow';
  return 'green';
}

function bucketLines(status: CodexStatus): string[] {
  if (!status.ok || !status.buckets?.length) return [];
  return status.buckets.map((bucket) => {
    const reset = bucket.resetText ? ` / Reset: ${bucket.resetText}` : '';
    return `${bucket.label}: ${bucket.remainingText}${reset}`;
  });
}

export function formatStatusTooltip(status: CodexStatus, now = new Date()): string {
  const staleSuffix = isStale(status, now) ? ' (stale)' : '';
  const updated = formatLocalTime(status.fetchedAt);
  if (!status.ok) {
    return `Codex: ${status.error}${staleSuffix}\nUpdated: ${updated}`;
  }
  const buckets = bucketLines(status);
  if (buckets.length > 0) {
    return `Codex buckets${staleSuffix}\n${buckets.join('\n')}\nPrimary: ${status.remainingText}\nUpdated: ${updated}`;
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
  if (status.buckets?.length) {
    const buckets = status.buckets.map((bucket) => `${bucket.label} ${bucket.remainingPercent}%`).join('，');
    return `Codex 額度：${buckets}；主要告警值 ${status.remainingPercent}%，最後更新：${formatLocalTime(status.fetchedAt)}`;
  }
  const reset = status.resetText ? `，重置：${status.resetText}` : '';
  return `Codex 剩餘：${status.remainingPercent}%${reset}，最後更新：${formatLocalTime(status.fetchedAt)}`;
}
