# Codex Meter

Windows tray app prototype for monitoring ChatGPT/OpenAI Codex quota without manually opening the usage page every time.

## Privacy and security

- No telemetry and no author-operated server are used.
- ChatGPT/OpenAI login stays in an isolated local Chrome profile.
- The app does not ask for or store your OpenAI password.
- The app does not read your normal Chrome/Edge profile.
- Discord webhook support is optional; the webhook URL is stored locally only.
- Discord messages contain only quota status/failure summaries, not cookies or browser session data.
- Runtime files and browser profiles should never be committed.

## Documentation

- [Installation guide](docs/install.md)
- [Usage guide](docs/usage.md)

Quick start on Windows PowerShell:

```powershell
git clone https://github.com/owewiin/codex-meter.git
cd codex-meter
npm install
npm run tauri:dev
```

## Current MVP status

Implemented:

- React/Tauri settings and status UI.
- Shared quota status/config logic with tests.
- Node + Playwright worker with fixture, login, and fetch modes against the Codex usage page.
- Separate 5-hour and weekly quota bucket parsing when the usage page exposes both labels.
- Local-cache-oriented Tauri backend shell.
- Windows system tray icon with open/hide, refresh, login/re-login, tooltip status, and quit menu actions.
- Discord webhook send command in backend shell.

Important limitation in some WSL/Linux environments:

- Native Tauri Linux builds may require system development libraries such as `libdbus-1-dev`/WebKitGTK.
- Playwright Chromium may require additional runtime libraries; install Playwright system deps before real browser fetches.

## Development commands

```bash
npm install
npx playwright install chromium
npm test -- --run
npm run build
npm run worker:fixture -- --text "Codex 72% remaining resets in 3h 12m ChatGPT Pro"
npm run worker:fixture -- --text "Codex 5-hour limit 72% remaining resets in 3h 12m Weekly limit 41% remaining resets in 4d 6h ChatGPT Pro"
npm run worker:fetch:win
```

After installing Rust/Cargo and Tauri prerequisites on Windows or WSL:

```bash
. "$HOME/.cargo/env"
npm run tauri:dev
npm run tauri:build
```

On Windows PowerShell, run from the project directory:

```powershell
cd C:\path\to\codex-meter
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
npm run tauri:dev
```

The app now stays resident in the Windows system tray. Closing the main window hides it instead of quitting. Use the tray menu to `Open Codex Meter`, `Hide Window`, `Refresh Now`, `Login / Re-login`, or `Quit`.

On Ubuntu/WSL, native Tauri + Playwright prerequisites typically include:

```bash
sudo apt install libdbus-1-dev pkg-config
npx playwright install-deps chromium
```

## Manual Windows Chrome login/fetch concept

The app uses an isolated persistent Windows Chrome profile on the Desktop:

```text
C:\Users\<you>\Desktop\codex-meter-manual-chrome-profile\
```

Login flow:

1. Start the Tauri app.
2. Click `Login / Re-login`.
3. A visible Windows Chrome window opens with remote debugging on port `9223`.
4. Sign in to ChatGPT/OpenAI manually.
5. Run `Refresh Now`; the worker reads `https://chatgpt.com/codex/settings/usage` from that isolated profile.

The app does not store your OpenAI password and does not read your normal Chrome/Edge cookies.

## Local cache

Planned runtime cache path:

```text
%APPDATA%\CodexMeter\status.json
%APPDATA%\CodexMeter\config.json
%APPDATA%\CodexMeter\history.jsonl
```

Other local automation tools can read `status.json` for local-only integrations.
