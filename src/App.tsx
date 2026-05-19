import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_CONFIG, normalizeConfig } from './shared/config';
import { formatStatusTooltip, humanSummary, quotaColor } from './shared/status';
import type { CodexMeterConfig, CodexStatus } from './shared/types';

const mockStatus: CodexStatus = {
  ok: true,
  source: 'fixture',
  remainingText: '72% remaining',
  remainingPercent: 72,
  resetText: 'resets in 3h 12m',
  planText: 'ChatGPT Pro',
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
  const [message, setMessage] = useState('Browser preview mode：目前顯示 mock status。');

  useEffect(() => {
    void safeInvoke<CodexStatus>('get_status', undefined, mockStatus).then(setStatus);
    void safeInvoke<CodexMeterConfig>('get_config', undefined, DEFAULT_CONFIG).then((value) => setConfig(normalizeConfig(value)));
  }, []);

  const color = useMemo(() => quotaColor(status, config.lowThresholdPercent), [status, config.lowThresholdPercent]);
  const tooltip = useMemo(() => formatStatusTooltip(status), [status]);

  async function refreshNow() {
    setBusy(true);
    setMessage('Refreshing Codex quota...');
    const next = await safeInvoke<CodexStatus>('refresh_now', { config }, mockStatus);
    setStatus(next);
    setMessage(next.ok ? 'Refresh completed.' : `Refresh failed: ${next.error}`);
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
        <pre>{tooltip}</pre>
        <div className="actions">
          <button disabled={busy} onClick={refreshNow}>Refresh Now</button>
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
        <label className="wide">
          Discord Webhook URL
          <input type="password" value={config.discord.webhookUrl} onChange={(event) => setConfig({ ...config, discord: { ...config.discord, webhookUrl: event.target.value } })} />
        </label>
        <button className="save" onClick={saveConfig}>Save Settings</button>
      </section>
    </main>
  );
}
