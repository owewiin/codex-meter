# Codex Meter

Windows tray app prototype for monitoring ChatGPT/OpenAI Codex quota without manually opening the usage page every time.

## Current MVP status

Implemented:

- React/Tauri settings and status UI.
- Shared quota status/config logic with tests.
- Node + Playwright worker with fixture, login, and fetch modes.
- Separate 5-hour and weekly quota bucket parsing when the usage page exposes both labels.
- Local-cache-oriented Tauri backend shell.
- Discord webhook send command in backend shell.

Important limitation in the current WSL environment:

- Node/npm are installed and verified.
- Rust/Cargo are installed under the Hermes profile home; source `$HOME/.cargo/env` before native builds.
- Native Tauri Linux builds still require system development libraries such as `libdbus-1-dev`/WebKitGTK. This WSL user cannot install them without sudo.
- Playwright Chromium is installed, but this WSL image is missing Chromium runtime libraries such as `libnspr4`; install Playwright system deps before real browser fetches.

## Development commands

```bash
npm install
npx playwright install chromium
npm test -- --run
npm run build
npm run worker:fixture -- --text "Codex 72% remaining resets in 3h 12m ChatGPT Pro"
npm run worker:fixture -- --text "Codex 5-hour limit 72% remaining resets in 3h 12m Weekly limit 41% remaining resets in 4d 6h ChatGPT Pro"
```

After installing Rust/Cargo and Tauri prerequisites on Windows or WSL:

```bash
. "$HOME/.cargo/env"
npm run tauri:dev
npm run tauri:build
```

On Ubuntu/WSL, native Tauri + Playwright prerequisites typically include:

```bash
sudo apt install libdbus-1-dev pkg-config
npx playwright install-deps chromium
```

## Playwright login/fetch concept

The app uses an isolated persistent Playwright profile under app data:

```text
%APPDATA%\CodexMeter\playwright-profile\
```

Login flow:

1. Start the Tauri app.
2. Click `Login / Re-login`.
3. A visible Playwright Chromium window opens.
4. Sign in to ChatGPT/OpenAI manually.
5. Run `Refresh Now`.

The app does not store your OpenAI password and does not read your normal Chrome/Edge cookies.

## Local cache

Planned runtime cache path:

```text
%APPDATA%\CodexMeter\status.json
%APPDATA%\CodexMeter\config.json
%APPDATA%\CodexMeter\history.jsonl
```

Hermes/Chani can read `status.json` later for Discord instant query replies.
