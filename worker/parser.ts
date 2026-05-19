import type { CodexStatus } from '../src/shared/types';

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

  const percentText = firstMatch(normalized, [
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

  const resetText = firstMatch(normalized, [
    /((?:resets?|reset)\s+in\s+(?:\d+\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\s*){1,4})/i,
    /((?:resets?|reset)\s+at\s+[^.。|,;]{2,40})/i,
    /(重置(?:於|在)?\s*[^.。|,;]{2,40})/i,
  ]);
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
    fetchedAt,
    usagePageUrl: options.usagePageUrl,
    rawText: normalized.slice(0, 2000),
  };
}
