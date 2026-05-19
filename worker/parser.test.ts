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

  it('parses separate 5-hour and weekly quota buckets', () => {
    const result = parseQuotaText(
      'Codex 5-hour limit 72% remaining resets in 3h 12m Weekly limit 41% remaining resets in 4d 6h ChatGPT Pro',
      { source: 'fixture', fetchedAt: '2026-05-19T10:00:00+08:00' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buckets).toEqual([
        {
          id: 'five_hour',
          label: '5-hour',
          remainingText: '72% remaining',
          remainingPercent: 72,
          resetText: 'resets in 3h 12m',
        },
        {
          id: 'weekly',
          label: 'weekly',
          remainingText: '41% remaining',
          remainingPercent: 41,
          resetText: 'resets in 4d 6h',
        },
      ]);
      expect(result.remainingPercent).toBe(41);
      expect(result.resetText).toBe('resets in 4d 6h');
    }
  });

  it('uses the lowest parsed bucket for the top-level remaining percent', () => {
    const result = parseQuotaText('Codex 5h 72% remaining reset in 3h weekly 18% remaining reset in 2d', { source: 'fixture' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remainingPercent).toBe(18);
      expect(result.buckets?.map((bucket) => bucket.id)).toEqual(['five_hour', 'weekly']);
    }
  });

  it('parses compact bucket labels and reset wording variants', () => {
    const result = parseQuotaText('Usage 5h: 12% left reset in 48 minutes. Weekly quota: 91% available resets in 5 days.', { source: 'fixture' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buckets).toMatchObject([
        { id: 'five_hour', label: '5-hour', remainingPercent: 12, resetText: 'reset in 48 minutes' },
        { id: 'weekly', label: 'weekly', remainingPercent: 91, resetText: 'resets in 5 days' },
      ]);
      expect(result.remainingPercent).toBe(12);
    }
  });

  it('parses Traditional Chinese Codex usage page bucket labels', () => {
    const result = parseQuotaText(
      'Codex 使用量會計入你的共用代理式使用上限 5 小時使用情況限制 87% 剩餘 重設時間 2026年5月20日 上午12:29 每週使用情況限制 73% 剩餘 重設時間 2026年5月24日 上午8:15',
      { source: 'fixture' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.buckets).toMatchObject([
        { id: 'five_hour', label: '5-hour', remainingPercent: 87, resetText: '重設時間 2026年5月20日 上午12:29' },
        { id: 'weekly', label: 'weekly', remainingPercent: 73, resetText: '重設時間 2026年5月24日 上午8:15' },
      ]);
      expect(result.remainingPercent).toBe(73);
      expect(result.resetText).toBe('重設時間 2026年5月24日 上午8:15');
    }
  });
});
