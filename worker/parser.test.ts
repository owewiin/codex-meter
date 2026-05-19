import { describe, expect, it } from 'vitest';
import { parseQuotaText } from './parser';

describe('parseQuotaText', () => {
  it('parses English percent and reset text', () => {
    const result = parseQuotaText('Codex usage 72% remaining resets in 3h 12m ChatGPT Pro', {
      source: 'fixture',
      fetchedAt: '2026-05-19T10:00:00+08:00',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remainingPercent).toBe(72);
      expect(result.resetText).toContain('resets in 3h 12m');
      expect(result.planText).toBe('ChatGPT Pro');
    }
  });

  it('parses percent before remaining', () => {
    const result = parseQuotaText('You have 18% remaining. reset at 15:00', { source: 'fixture' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.remainingPercent).toBe(18);
  });

  it('parses Traditional Chinese remaining text', () => {
    const result = parseQuotaText('Codex 額度 剩餘 33% 重置於 2 小時後', { source: 'fixture' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.remainingPercent).toBe(33);
  });

  it('fails instead of inventing a percentage', () => {
    const result = parseQuotaText('Your Codex quota is almost done but no number is visible.', { source: 'fixture' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe('PARSER_NO_MATCH');
  });
});
