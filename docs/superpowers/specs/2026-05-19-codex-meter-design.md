# Codex Meter Design Spec

**Project name:** Codex Meter

**Goal:** Build a Windows system-tray app that shows Jason's ChatGPT/OpenAI Codex usage quota without manually opening the web page, with later Discord notification/query support.

**Approved direction:** Tauri Windows tray app + Playwright persistent browser profile. The app reads the same logged-in ChatGPT/OpenAI session repeatedly; Jason logs in manually inside the controlled browser window. The app never stores OpenAI account passwords.

**Spec location:** `codex-quota-tray/docs/superpowers/specs/2026-05-19-codex-meter-design.md`

**Implementation workspace:** `codex-quota-tray/` project root. Paths below are relative to that project root unless otherwise stated.

---

## 1. Scope

### In scope for MVP

- Windows system-tray app built with Tauri.
- Small settings/status window built with TypeScript + React.
- Playwright-based quota fetcher using a persistent browser profile.
- Manual `Login / Re-login` flow that opens a visible browser window for Jason to authenticate.
- Manual `Refresh Now` action.
- Background refresh every configured interval, default 15 minutes.
- Local status cache at `%APPDATA%\\CodexMeter\\status.json`.
- Local config at `%APPDATA%\\CodexMeter\\config.json`.
- Tray tooltip and icon state based on latest quota status.
- Windows notification when quota is low, login is required, or fetch status recovers.
- Discord webhook notification support for low quota / failure / recovery / manual send.
- Hermes/Chani compatibility through `status.json`, so Discord chat queries can read the local cache without a dedicated bot in v0.1.

### Out of scope for MVP

- Native Discord slash command bot.
- Multi-account support.
- Historical charts beyond a simple append-only debug/history file.
- Automatic OpenAI login or password storage.
- Browser-cookie extraction from Jason's normal Chrome/Edge profile.
- High-frequency polling that could look abusive.
- Cross-platform macOS/Linux packaging.

---

## 2. User Experience

### Tray icon states

| State | Icon color | Tooltip summary |
|---|---|---|
| Quota > 50% | Green | `Codex: 72% remaining / Reset: 3h 12m / Updated: 10:32` |
| Quota 20%~50% | Yellow | Same format, lower quota |
| Quota < threshold | Red | Low quota warning |
| Not logged in / fetch failed | Gray | `Codex: login required` or failure reason |
| Refresh in progress | Blue or spinner variant | `Codex: refreshing...` |

### Tray menu

- `Codex Quota: <current summary>` disabled header
- `Refresh Now`
- `Open Usage Page`
- `Login / Re-login`
- `Send Status to Discord`
- `Open Settings`
- `Open Logs Folder`
- `Quit`

### Settings window

The settings window should expose:

- Usage page URL.
- Refresh interval minutes.
- Low quota threshold percent.
- Discord webhook enabled/disabled.
- Discord webhook URL, masked by default.
- Notification toggles:
  - Windows low-quota notification.
  - Discord low-quota notification.
  - Discord fetch-failed notification.
  - Discord recovery notification.
  - Discord every refresh, default off.
- Buttons:
  - Save settings.
  - Test Discord webhook.
  - Login / Re-login.
  - Refresh now.

---

## 3. Architecture

```text
Codex Meter
├─ Tauri Rust backend
│  ├─ tray menu + icon state
│  ├─ background scheduler
│  ├─ config/status/history/log file IO
│  ├─ Windows notifications
│  ├─ Discord webhook sender
│  └─ child-process runner for Playwright worker
├─ React/TypeScript frontend
│  ├─ status panel
│  ├─ settings form
│  └─ action buttons
└─ Node.js Playwright worker
   ├─ persistent profile login flow
   ├─ quota page navigation
   ├─ network/DOM/text parser strategies
   └─ normalized JSON result output
```

### Why Node Playwright worker instead of Rust-only fetching

- Playwright's Node ecosystem is mature and easier to maintain for web UI scraping.
- The unstable part is ChatGPT/Codex page parsing; keeping it in TypeScript/Node allows faster parser updates.
- Tauri remains focused on desktop integration: tray, settings, scheduler, notifications, filesystem, and packaging.

---

## 4. Data Storage

### App data directory

Use Windows app data:

```text
%APPDATA%\\CodexMeter\\
├─ config.json
├─ status.json
├─ history.jsonl
├─ logs\\
└─ playwright-profile\\
```

### `config.json`

```json
{
  "usagePageUrl": "https://chatgpt.com/",
  "refreshIntervalMinutes": 15,
  "lowThresholdPercent": 20,
  "discord": {
    "enabled": false,
    "webhookUrl": "",
    "notifyOnLowQuota": true,
    "notifyOnFetchFailure": true,
    "notifyOnRecovery": true,
    "notifyEveryRefresh": false
  },
  "notifications": {
    "windowsLowQuota": true,
    "windowsFetchFailure": true,
    "windowsRecovery": true
  }
}
```

### `status.json`

Successful result:

```json
{
  "ok": true,
  "source": "chatgpt_web",
  "remainingText": "72% remaining",
  "remainingPercent": 72,
  "resetText": "resets in 3h 12m",
  "planText": "ChatGPT Pro",
  "fetchedAt": "2026-05-19T10:32:00+08:00",
  "usagePageUrl": "https://chatgpt.com/"
}
```

Failure result:

```json
{
  "ok": false,
  "source": "chatgpt_web",
  "errorCode": "LOGIN_REQUIRED",
  "error": "Login required or quota element not found",
  "fetchedAt": "2026-05-19T10:32:00+08:00",
  "usagePageUrl": "https://chatgpt.com/"
}
```

### `history.jsonl`

Append one compact JSON object per fetch attempt. Keep this for debugging parser drift and quota behavior. It should not store full page HTML by default.

---

## 5. Fetcher Behavior

### Login / Re-login flow

- Tauri invokes the Playwright worker with mode `login`.
- Worker launches a visible persistent Chromium context using `%APPDATA%\\CodexMeter\\playwright-profile`.
- Worker navigates to the configured usage page or ChatGPT entry page.
- Jason manually logs in and handles any verification.
- Worker waits until logged-in UI appears or until Jason closes the window.
- Worker exits with a JSON result describing whether login appears valid.

### Refresh flow

- Tauri invokes worker with mode `fetch`.
- Worker launches persistent context headlessly if reliable; otherwise visible/minimized can be a fallback config later.
- Worker navigates to configured usage page.
- Worker attempts extraction in this order:
  1. Inspect relevant network responses if they are accessible and stable.
  2. Inspect DOM selectors known to contain usage/quota data.
  3. Inspect visible page text with conservative regex patterns.
- Worker outputs normalized JSON to stdout.
- Tauri validates JSON, writes `status.json`, appends `history.jsonl`, updates tray state, and dispatches notifications if needed.

### Parser discipline

- Parser must distinguish between confirmed numeric fields and raw text.
- If it cannot confidently parse `remainingPercent`, it may still return `remainingText`, but `ok` should be false or `partial` should be explicit.
- Parser should never invent a percentage from ambiguous text.
- On parser failure, save a sanitized debug artifact path in logs; do not store cookies/tokens in logs.

---

## 6. Discord Integration

### MVP: Discord webhook

- Store webhook URL in local config only.
- Mask webhook URL in UI.
- Send notification only when enabled and one of these conditions occurs:
  - quota crosses below threshold;
  - fetch transitions from success to failure;
  - fetch transitions from failure to success;
  - Jason manually clicks `Send Status to Discord`;
  - `notifyEveryRefresh` is explicitly enabled.

### Message format

Low quota:

```text
Codex 額度偏低

剩餘：18%
重置：2h 40m
最後更新：10:32
```

Failure:

```text
Codex 額度查詢失敗

原因：Login required or quota element not found
最後嘗試：10:32
請在 Codex Meter 點 Login / Re-login。
```

### Hermes immediate query compatibility

Hermes/Chani can answer Discord queries by reading:

```text
%APPDATA%\\CodexMeter\\status.json
```

This avoids building a separate slash-command bot in v0.1. Dedicated `/codex-quota` slash command is a v0.2 feature after web extraction is stable.

---

## 7. Error Handling

| Error | App behavior |
|---|---|
| Login required | Gray tray icon, tooltip shows login required, notify once per state transition |
| Usage element not found | Gray tray icon, log parser failure, keep previous successful status visible as stale if available |
| Network timeout | Gray or stale state, retry on next interval, manual refresh available |
| Discord webhook invalid | Show settings error and log HTTP response, do not retry aggressively |
| Worker crashes | Capture exit code/stderr, write failure status, notify once per transition |
| Config invalid | Load defaults for invalid fields and preserve a `.bak` copy before overwriting |

Stale status should be explicit. If the last successful quota is old, tooltip should say for example:

```text
Codex: 72% remaining (stale, updated 2h ago)
```

---

## 8. Security and Privacy

- Do not store OpenAI username/password.
- Do not read Jason's normal browser cookies.
- Use an isolated Playwright profile under app data.
- Mask Discord webhook URL in UI and logs.
- Do not commit config, status, profile, or logs.
- Logs must not include cookies, authorization headers, full localStorage, or full HTML dumps by default.
- If debug HTML/screenshot capture is added later, it must be opt-in and clearly labeled as sensitive.

---

## 9. Testing Strategy

### Unit tests

- Config defaulting and validation.
- Status JSON serialization/deserialization.
- Threshold transition detection.
- Discord notification decision logic.
- Parser tests using saved sanitized HTML/text fixtures.

### Integration tests

- Worker returns valid JSON for mocked fixture page.
- Tauri backend handles successful worker result and failure result.
- Discord webhook sender can be tested against a local mock HTTP server.

### Manual acceptance tests

- Fresh install shows gray tray icon and asks for login.
- Login / Re-login opens visible Playwright browser.
- After login, Refresh Now updates `status.json`.
- Tooltip changes according to quota state.
- Low threshold test triggers Windows notification.
- Test Discord webhook sends expected message.
- App restart reuses persisted session and config.

---

## 10. Implementation Phases

### Phase 1: Project skeleton and app shell

- Create Tauri + React app.
- Add tray icon, menu, status window, and settings window shell.
- Add app data path handling.

### Phase 2: Config/status cache

- Implement config read/write with defaults.
- Implement status read/write and history append.
- Render current status in UI and tray tooltip.

### Phase 3: Playwright worker

- Add Node/TypeScript Playwright worker.
- Implement login mode with persistent profile.
- Implement fixture-based parser tests.
- Implement fetch mode and normalized JSON stdout.

### Phase 4: Scheduler and notifications

- Add background refresh interval.
- Add manual refresh.
- Add Windows notification on threshold/failure/recovery transitions.

### Phase 5: Discord webhook

- Add webhook settings.
- Add test webhook action.
- Add threshold/failure/recovery/manual notification logic.

### Phase 6: Packaging and documentation

- Package for Windows.
- Document installation, login, troubleshooting, and Hermes/Chani `status.json` query path.

---

## 11. Open Questions for Implementation Planning

These do not block the approved design, but the implementation plan should resolve them explicitly:

1. Exact ChatGPT/Codex usage page URL and visual text used by Jason's current account.
2. Whether headless Playwright works reliably after login, or whether fetch mode must remain visible/minimized.
3. Whether Tauri sidecar packaging should bundle Node + worker, or invoke a packaged executable produced from the worker.
4. Preferred Windows startup behavior: manual launch only for MVP, or add `Start with Windows` in v0.2.
5. Whether Jason wants status shown as percent, text quota, remaining messages, reset time, or all fields depending on what the page exposes.

---

## 12. Self-review

- No implementation code is included in this design spec.
- Scope is focused on one app: Windows tray quota monitor with Playwright profile and Discord webhook integration.
- The design separates desktop shell, fetcher worker, cache, notifications, and Discord integration.
- The design explicitly avoids password storage and normal-browser cookie extraction.
- Ambiguous web extraction is handled by parser discipline and failure states rather than invented quota values.
