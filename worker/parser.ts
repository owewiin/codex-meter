import type { CodexQuotaBucket, CodexStatus } from '../src/shared/types';

export interface ParseOptions {
  source?: 'chatgpt_web' | 'fixture';
  fetchedAt?: string;
  usagePageUrl?: string;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function normalizeBucketLabel(labelText: string): Pick<CodexQuotaBucket, 'id' | 'label'> {
  if (/5\s*(?:-|\s)?(?:h|hr|hour)/i.test(labelText)) return { id: 'five_hour', label: '5-hour' };
  if (/week|weekly|一週|每週/i.test(labelText)) return { id: 'weekly', label: 'weekly' };
  return { id: 'unknown', label: labelText.trim() || 'quota' };
}

function findResetText(text: string): string | undefined {
  return firstMatch(text, [
    /((?:resets?|reset)\s+in\s+(?:\d+\s*(?:days|day|d|hours|hour|hrs|hr|h|minutes|minute|mins|min|m)\s*){1,4})/i,
    /((?:resets?|reset)\s+at\s+[^.。|,;]{2,40})/i,
    /(重置(?:於|在)?\s*[^.。|,;]{2,40})/i,
  ]);
}

function parseQuotaBuckets(normalized: string): CodexQuotaBucket[] {
  const bucketPattern = /((?:5\s*(?:-|\s)?(?:h|hr|hour)|weekly|week|一週|每週)[^%]{0,80}?)(\d{1,3})\s*%\s*(?:remaining|left|available|剩餘)?/gi;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = bucketPattern.exec(normalized)) !== null) {
    matches.push(match);
  }
  const buckets: CodexQuotaBucket[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const percent = Number(match[2]);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue;

    const { id, label } = normalizeBucketLabel(match[1]);
    if (buckets.some((bucket) => bucket.id === id)) continue;

    const segmentStart = match.index ?? 0;
    const segmentEnd = matches[index + 1]?.index ?? normalized.length;
    const segment = normalized.slice(segmentStart, segmentEnd);

    buckets.push({
      id,
      label,
      remainingText: `${percent}% remaining`,
      remainingPercent: percent,
      resetText: findResetText(segment),
    });
  }

  return buckets;
}

export function parseQuotaText(text: string, options: ParseOptions = {}): CodexStatus {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const source = options.source ?? 'chatgpt_web';

  if (!normalized) {
    return {
      ok: false,
      source,
      errorCode: 'PARSER_NO_MATCH',
      error: 'No readable quota text found',
      fetchedAt,
      usagePageUrl: options.usagePageUrl,
      rawText: text,
    };
  }

  const buckets = parseQuotaBuckets(normalized);
  const primaryBucket = buckets.length > 0
    ? [...buckets].sort((left, right) => left.remainingPercent - right.remainingPercent)[0]
    : undefined;

  const percentText = primaryBucket ? String(primaryBucket.remainingPercent) : firstMatch(normalized, [
    /(?:Codex|usage|quota|remaining)[^0-9]{0,40}(\d{1,3})\s*%/i,
    /(\d{1,3})\s*%\s*(?:remaining|left|available)/i,
    /剩餘[^0-9]{0,20}(\d{1,3})\s*%/i,
  ]);

  const percent = percentText === undefined ? NaN : Number(percentText);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return {
      ok: false,
      source,
      errorCode: 'PARSER_NO_MATCH',
      error: 'Quota percentage not found in page text',
      fetchedAt,
      usagePageUrl: options.usagePageUrl,
      rawText: normalized.slice(0, 2000),
    };
  }

  const resetText = primaryBucket?.resetText ?? findResetText(normalized);
  const planText = firstMatch(normalized, [
    /(ChatGPT\s+(?:Plus|Pro|Team|Enterprise))/i,
    /(Plus|Pro|Team|Enterprise)\s+plan/i,
  ]);

  return {
    ok: true,
    source,
    remainingText: `${percent}% remaining`,
    remainingPercent: percent,
    resetText,
    planText,
    buckets: buckets.length > 0 ? buckets : undefined,
    fetchedAt,
    usagePageUrl: options.usagePageUrl,
    rawText: normalized.slice(0, 2000),
  };
}
