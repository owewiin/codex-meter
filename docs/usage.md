# Codex Meter Usage Guide

Codex Meter is a Windows tray monitor for ChatGPT/OpenAI Codex quota. It opens the Codex usage page through an isolated Chrome profile, parses the visible quota text, stores the latest status locally, and can optionally send the status to Discord.

For setup, see [`docs/install.md`](./install.md).

## Quick start

```powershell
git clone https://github.com/owewiin/codex-meter.git
cd codex-meter
npm install
npm run tauri:dev
```

First run:

1. Click `Login / Re-login` in the app or tray menu.
2. A visible Windows Chrome window opens.
3. Sign in to ChatGPT/OpenAI manually.
4. Click `Refresh Now`.
5. Check the app status card and tray tooltip.

## Tray behavior

Codex Meter is designed to stay resident in the Windows system tray.

- Closing the main window hides it instead of quitting.
- Right-click the tray icon to open the menu.
- Hover the tray icon to see the latest parsed quota tooltip.
- Use `Quit` from the tray menu to fully exit.

Tray menu actions:

| Action | Purpose |
| --- | --- |
| `Open Codex Meter` | Show the main window. |
| `Hide Window` | Hide the main window and keep the tray app running. |
| `Refresh Now` | Fetch and parse the current Codex usage page. |
| `Login / Re-login` | Open the isolated Chrome profile for manual sign-in. |
| `Quit` | Exit the tray app. |

## Login / re-login flow

Codex Meter does not ask for or store your OpenAI password. Login is done manually in a dedicated Chrome profile.

Profile path:

```text
%USERPROFILE%\Desktop\codex-meter-manual-chrome-profile\
```

Steps:

1. Start Codex Meter.
2. Click `Login / Re-login`.
3. Complete login in the Chrome window that opens.
4. Leave that profile signed in.
5. Return to Codex Meter and click `Refresh Now`.

The default usage page is:

```text
https://chatgpt.com/codex/settings/usage
```

## Refreshing quota status

Use one of these options:

- Click `Refresh Now` in the main window.
- Right-click the tray icon and choose `Refresh Now`.
- Run the worker command manually during development.

Manual Windows worker command:

```powershell
npm run worker:fetch:win
```

The worker connects to Chrome through the configured debugging port and returns JSON status.

## Understanding quota output

Codex Meter supports both simple and multi-bucket quota text.

Single quota example:

```text
Codex 72% remaining resets in 3h 12m ChatGPT Pro
```

Multi-bucket example:

```text
Codex 5-hour limit 72% remaining resets in 3h 12m Weekly limit 41% remaining resets in 4d 6h ChatGPT Pro
```

When both 5-hour and weekly buckets are visible, the top-level `remainingPercent` uses the lowest parsed bucket. This keeps tray color/status and Discord warnings conservative.

## Local status files

Codex Meter writes the latest state under:

```text
%APPDATA%\CodexMeter\status.json
%APPDATA%\CodexMeter\config.json
%APPDATA%\CodexMeter\history.jsonl
```

Typical uses:

- `status.json`: latest parsed quota snapshot.
- `config.json`: local app settings, including Discord webhook settings if enabled.
- `history.jsonl`: append-only local history for future trend inspection.

These files are local-only and should not be committed.

## Discord webhook

To send quota status to Discord manually:

1. Create a Discord webhook for the target channel.
2. Open Codex Meter settings.
3. Enable Discord webhook.
4. Paste the webhook URL.
5. Save settings.
6. Click `Send Status to Discord`.

The webhook URL is stored only in local config.

## Development commands

Install dependencies:

```powershell
npm install
npx playwright install chromium
```

Run tests and frontend build:

```powershell
npm test -- --run
npm run build
```

Run parser fixtures:

```powershell
npm run worker:fixture -- --text "Codex 72% remaining resets in 3h 12m ChatGPT Pro"
npm run worker:fixture -- --text "Codex 5-hour limit 72% remaining resets in 3h 12m Weekly limit 41% remaining resets in 4d 6h ChatGPT Pro"
```

Run the Tauri app:

```powershell
npm run tauri:dev
```

Build a release package:

```powershell
npm run tauri:build
```

## Troubleshooting

### `Quota percentage not found`

The Codex usage page wording likely changed, or the page did not load the quota section. Re-login, refresh, and capture the visible usage text so the parser can be updated.

### `Login required`

The isolated Chrome profile is not signed in or the session expired. Use `Login / Re-login`, then refresh again.

### `Worker produced no JSON`

The Tauri backend could not run the Node/tsx worker or the worker crashed before writing JSON. Run the worker manually:

```powershell
npm run worker:fetch:win
```

### Chrome opens but refresh still fails

Make sure the login window is using the isolated profile opened by Codex Meter, not your normal Chrome profile. Then complete login and try `Refresh Now` again.

### `cargo: command not found`

Install Rustup and reopen PowerShell:

```powershell
winget install Rustlang.Rustup
```

Or temporarily add Cargo to PATH:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

### WSL Playwright missing libraries

Install Playwright browser dependencies inside WSL:

```bash
npx playwright install-deps chromium
```

For the actual Windows tray app, prefer running from Windows PowerShell.
