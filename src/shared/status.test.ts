import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, normalizeConfig } from './config';
import { formatStatusTooltip, quotaColor, shouldNotify } from './status';
import type { CodexStatus } from './types';

const ok = (percent: number): CodexStatus => ({
  ok: true,
  source: 'fixture',
  remainingText: `${percent}% remaining`,
  remainingPercent: percent,
  resetText: 'resets in 3h',
  fetchedAt: '2026-05-19T10:00:00+08:00',
});

const bucketed: CodexStatus = {
  ok: true,
  source: 'fixture',
  remainingText: '18% remaining',
  remainingPercent: 18,
  resetText: 'reset in 2d',
  fetchedAt: '2026-05-19T10:00:00+08:00',
  buckets: [
    { id: 'five_hour', label: '5-hour', remainingText: '72% remaining', remainingPercent: 72, resetText: 'reset in 3h' },
    { id: 'weekly', label: 'weekly', remainingText: '18% remaining', remainingPercent: 18, resetText: 'reset in 2d' },
  ],
};

const fail: CodexStatus = {
  ok: false,
  source: 'fixture',
  errorCode: 'LOGIN_REQUIRED',
  error: 'Login required',
  fetchedAt: '2026-05-19T10:00:00+08:00',
};

describe('normalizeConfig', () => {
  it('uses safe defaults', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it('clamps numeric settings', () => {
    const cfg = normalizeConfig({ refreshIntervalMinutes: 1, lowThresholdPercent: 300 });
    expect(cfg.refreshIntervalMinutes).toBe(5);
    expect(cfg.lowThresholdPercent).toBe(100);
  });
});

describe('status formatting', () => {
  it('chooses tray color from quota', () => {
    expect(quotaColor(ok(72))).toBe('green');
    expect(quotaColor(ok(35))).toBe('yellow');
    expect(quotaColor(ok(10))).toBe('red');
    expect(quotaColor(fail)).toBe('gray');
  });

  it('formats successful tooltip', () => {
    expect(formatStatusTooltip(ok(72), new Date('2026-05-19T10:10:00+08:00'))).toContain('Codex: 72% remaining');
  });

  it('formats separate quota buckets in the tooltip', () => {
    const tooltip = formatStatusTooltip(bucketed, new Date('2026-05-19T10:10:00+08:00'));
    expect(tooltip).toContain('5-hour: 72% remaining / Reset: reset in 3h');
    expect(tooltip).toContain('weekly: 18% remaining / Reset: reset in 2d');
    expect(tooltip).toContain('Primary: 18% remaining');
  });

  it('formats failed tooltip', () => {
    expect(formatStatusTooltip(fail, new Date('2026-05-19T10:10:00+08:00'))).toContain('Login required');
  });
});

describe('notification decisions', () => {
  it('notifies when crossing into low quota', () => {
    const decision = shouldNotify(ok(30), ok(10), DEFAULT_CONFIG);
    expect(decision.reasons).toContain('low_quota');
  });

  it('uses the primary bucket percent for low-quota alerts', () => {
    const decision = shouldNotify(ok(80), bucketed, DEFAULT_CONFIG);
    expect(decision.reasons).toContain('low_quota');
  });

  it('does not repeatedly notify when already low', () => {
    const decision = shouldNotify(ok(10), ok(9), DEFAULT_CONFIG);
    expect(decision.reasons).not.toContain('low_quota');
  });

  it('notifies on failure transition', () => {
    const decision = shouldNotify(ok(80), fail, DEFAULT_CONFIG);
    expect(decision.reasons).toContain('fetch_failed');
  });

  it('notifies on recovery transition', () => {
    const decision = shouldNotify(fail, ok(80), DEFAULT_CONFIG);
    expect(decision.reasons).toContain('recovered');
  });
});
