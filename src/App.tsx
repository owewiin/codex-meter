import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DEFAULT_CONFIG, normalizeConfig } from './shared/config';
import { formatStatusTooltip, humanSummary, quotaColor, shouldNotify } from './shared/status';
import type { CodexMeterConfig, CodexStatus } from './shared/types';

const mockStatus: CodexStatus = {
  ok: true,
  source: 'fixture',
  remainingText: '41% remaining',
  remainingPercent: 41,
  resetText: 'resets in 4d 6h',
  planText: 'ChatGPT Pro',
  buckets: [
    { id: 'five_hour', label: '5-hour', remainingText: '72% remaining', remainingPercent: 72, resetText: 'resets in 3h 12m' },
    { id: 'weekly', label: 'weekly', remainingText: '41% remaining', remainingPercent: 41, resetText: 'resets in 4d 6h' },
  ],
  fetchedAt: new Date().toISOString(),
  usagePageUrl: DEFAULT_CONFIG.usagePageUrl,
};

async function safeInvoke<T>(command: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

export default function App() {
  const [status, setStatus] = useState<CodexStatus>(mockStatus);
  const [config, setConfig] = useState<CodexMeterConfig>(DEFAULT_CONFIG);
  const [busy, setBusy] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [message, setMessage] = useState('Browser preview mode：目前顯示 mock status。');

  useEffect(() => {
    void safeInvoke<CodexStatus>('get_status', undefined, mockStatus).then(setStatus);
    void safeInvoke<CodexMeterConfig>('get_config', undefined, DEFAULT_CONFIG).then((value) => setConfig(normalizeConfig(value)));
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void listen<CodexStatus>('codex-status-updated', (event) => {
      setStatus(event.payload);
      setMessage(event.payload.ok ? 'Tray refresh completed.' : `Tray refresh failed: ${event.payload.error}`);
    }).then((fn) => {
      unsubscribe = fn;
    });
    return () => unsubscribe?.();
  }, []);

  const color = useMemo(() => quotaColor(status, config.lowThresholdPercent), [status, config.lowThresholdPercent]);
  const tooltip = useMemo(() => formatStatusTooltip(status), [status]);

  async function refreshNow(userInitiated = true) {
    setBusy(true);
    setMessage(userInitiated ? 'Refreshing Codex quota...' : 'Auto-refreshing Codex quota...');
    const previous = status;
    const activeConfig = normalizeConfig(config);
    const next = await safeInvoke<CodexStatus>('refresh_now', { config: activeConfig }, mockStatus);
    setStatus(next);

    const decision = shouldNotify(previous, next, activeConfig, false);
    let discordSuffix = '';
    if (activeConfig.discord.enabled && decision.notify) {
      await safeInvoke('send_status_to_discord', { status: next, config: activeConfig, manual: false }, null);
      discordSuffix = ` Discord notified: ${decision.reasons.join(', ')}.`;
    }

    setMessage(next.ok ? `Refresh completed.${discordSuffix}` : `Refresh failed: ${next.error}${discordSuffix}`);
    setBusy(false);
  }

  async function saveConfig() {
    const normalized = normalizeConfig(config);
    setConfig(normalized);
    await safeInvoke('save_config', { config: normalized }, null);
    setMessage('Settings saved.');
  }

  async function login() {
    setBusy(true);
    setMessage('Opening login window...');
    const next = await safeInvoke<CodexStatus>('login', { config }, {
      ok: false,
      source: 'fixture',
      errorCode: 'LOGIN_REQUIRED',
      error: 'Login is only available inside the Tauri app.',
      fetchedAt: new Date().toISOString(),
    });
    setStatus(next);
    setMessage(next.ok ? 'Login/fetch succeeded.' : next.error);
    setBusy(false);
  }

  async function sendDiscord() {
    await safeInvoke('send_status_to_discord', { status, config, manual: true }, null);
    setMessage('Discord status send requested.');
  }

  useEffect(() => {
    if (!autoRefreshEnabled || busy) return undefined;
    const ms = normalizeConfig(config).refreshIntervalMinutes * 60_000;
    const timer = window.setInterval(() => {
      void refreshNow(false);
    }, ms);
    return () => window.clearInterval(timer);
  }, [autoRefreshEnabled, busy, config, status]);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Codex Meter</p>
          <h1>Codex 額度監控</h1>
          <p className="summary">{humanSummary(status)}</p>
        </div>
        <div className={`meter ${color}`}>
          <span>{status.ok ? `${status.remainingPercent}%` : '!'}</span>
          <small>{status.ok ? 'remaining' : 'attention'}</small>
        </div>
      </section>

      <section className="card">
        <h2>目前狀態</h2>
        {status.ok && status.buckets?.length ? (
          <div className="bucket-grid">
            {status.buckets.map((bucket) => (
              <article className="bucket" key={bucket.id}>
                <strong>{bucket.label}</strong>
                <span>{bucket.remainingPercent}%</span>
                <small>{bucket.resetText ?? 'reset time not visible'}</small>
              </article>
            ))}
          </div>
        ) : null}
        <pre>{tooltip}</pre>
        <div className="actions">
          <button disabled={busy} onClick={() => void refreshNow(true)}>Refresh Now</button>
          <button disabled={busy} onClick={login}>Login / Re-login</button>
          <button disabled={busy || !config.discord.enabled} onClick={sendDiscord}>Send Status to Discord</button>
        </div>
        <p className="message">{message}</p>
      </section>

      <section className="card grid">
        <label>
          Usage Page URL
          <input value={config.usagePageUrl} onChange={(event) => setConfig({ ...config, usagePageUrl: event.target.value })} />
        </label>
        <label>
          Refresh Interval Minutes
          <input type="number" min={5} max={240} value={config.refreshIntervalMinutes} onChange={(event) => setConfig({ ...config, refreshIntervalMinutes: Number(event.target.value) })} />
        </label>
        <label>
          Low Threshold Percent
          <input type="number" min={1} max={100} value={config.lowThresholdPercent} onChange={(event) => setConfig({ ...config, lowThresholdPercent: Number(event.target.value) })} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={config.discord.enabled} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, enabled: event.target.checked } })} />
          Enable Discord Webhook
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={autoRefreshEnabled} onChange={(event) => setAutoRefreshEnabled(event.target.checked)} />
          Enable Auto Refresh
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={config.discord.notifyOnLowQuota} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, notifyOnLowQuota: event.target.checked } })} />
          Discord: Low quota alerts
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={config.discord.notifyOnFetchFailure} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, notifyOnFetchFailure: event.target.checked } })} />
          Discord: Fetch failure alerts
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={config.discord.notifyOnRecovery} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, notifyOnRecovery: event.target.checked } })} />
          Discord: Recovery alerts
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={config.discord.notifyEveryRefresh} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, notifyEveryRefresh: event.target.checked } })} />
          Discord: Notify every refresh
        </label>
        <label className="wide">
          Discord Webhook URL
          <input type="password" value={config.discord.webhookUrl} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, webhookUrl: event.target.value } })} />
        </label>
        <button className="save" onClick={saveConfig}>Save Settings</button>
      </section>
    </main>
  );
}
