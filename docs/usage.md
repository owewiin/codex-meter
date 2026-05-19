# Codex Meter Usage Guide

## Install dependencies

```bash
npm install
```

Install Playwright browser binaries when ready to test real login/fetch:

```bash
npx playwright install chromium
```

## Verify non-native pieces

```bash
npm test -- --run
npm run build
npm run worker:fixture -- --text "Codex 72% remaining resets in 3h 12m ChatGPT Pro"
```

Expected fixture output:

```json
{
  "ok": true,
  "source": "fixture",
  "remainingPercent": 72,
  "resetText": "resets in 3h 12m",
  "planText": "ChatGPT Pro"
}
```

## Run the Tauri app

Tauri native run requires Rust/Cargo and platform prerequisites.

```bash
cargo --version
npm run tauri:dev
```

If `cargo: command not found`, install Rust first:

```bash
winget install Rustlang.Rustup
```

Then open a fresh terminal and verify:

```bash
rustc --version
cargo --version
```

## Login flow

1. Run the app with `npm run tauri:dev`.
2. Click `Login / Re-login`.
3. Complete ChatGPT/OpenAI login in the Playwright Chromium window.
4. Click `Refresh Now`.
5. Check the status panel and `%APPDATA%\CodexMeter\status.json`.

## Discord webhook

1. Create a Discord webhook for the target channel.
2. Open Codex Meter settings.
3. Enable Discord webhook.
4. Paste the webhook URL.
5. Save settings.
6. Use `Send Status to Discord` for a manual test.

Webhook URL is stored only in local config and should not be committed.

## Troubleshooting

- `Quota percentage not found`: the ChatGPT/Codex page text changed or the usage page is not visible. Use Login / Re-login and capture the visible wording for parser update.
- `Login required`: persistent profile is not logged in or the session expired.
- `Worker produced no JSON`: Node/tsx/worker path failed from the Tauri backend.
- Native build fails before compilation: ensure Rust/Cargo and Tauri prerequisites are installed.
