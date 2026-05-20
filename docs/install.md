# Codex Meter Installation Guide

Codex Meter is a Windows tray app that monitors the ChatGPT/OpenAI Codex usage page with an isolated Chrome profile and shows the latest quota status in the app and tray tooltip.

This project is currently optimized for Windows. WSL can be used for editing, tests, and frontend builds, but the actual tray app and manual Chrome login flow should be run on Windows.

## Requirements

### Required

- Windows 10/11
- Git
- Node.js 20+ or 22+
- npm
- Rust toolchain with Cargo
- Google Chrome installed on Windows

### Optional

- Discord webhook URL, if you want manual status posting to Discord.
- WSL, if you prefer editing/running tests from Linux. Native Tauri packaging still needs Windows for the Windows tray build.

## Clone the repository

```powershell
git clone https://github.com/owewiin/codex-meter.git
cd codex-meter
```

## Install Node dependencies

```powershell
npm install
```

Install Playwright's Chromium browser package for parser/worker development:

```powershell
npx playwright install chromium
```

Codex Meter's normal Windows fetch path uses your installed Windows Chrome through an isolated profile. The Playwright browser install is still useful for development and tests.

## Install Rust/Cargo

If Cargo is not installed yet, install Rustup:

```powershell
winget install Rustlang.Rustup
```

Close and reopen PowerShell, then verify:

```powershell
rustc --version
cargo --version
```

If `cargo` is still not found, add Cargo to the current shell path:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

## Development install verification

Run these from the project directory:

```powershell
npm test -- --run
npm run build
npm run worker:fixture -- --text "Codex 5-hour limit 72% remaining resets in 3h 12m Weekly limit 41% remaining resets in 4d 6h ChatGPT Pro"
```

Expected result:

- Vitest passes.
- TypeScript/Vite build succeeds.
- Fixture worker prints JSON with parsed quota fields.

## Run the tray app in development mode

```powershell
npm run tauri:dev
```

The app window opens and a tray icon appears. Closing the window hides it; it continues running until you choose `Quit` from the tray menu.

## Build a Windows installer/package

```powershell
npm run tauri:build
```

Tauri writes build outputs under:

```text
src-tauri\target\release\bundle\
```

Common artifacts include MSI/NSIS installer files depending on the Tauri bundler configuration and installed Windows tooling.

## Install from a built package

1. Open the generated installer under `src-tauri\target\release\bundle\`.
2. Complete the installer wizard.
3. Launch `Codex Meter` from the Start menu or installed shortcut.
4. Use the tray menu for refresh/login/quit actions.

## WSL notes

From WSL, you can run:

```bash
npm install
npm test -- --run
npm run build
```

Native Tauri builds inside Linux/WSL require additional system libraries such as DBus/WebKitGTK development packages. If Playwright Chromium fails inside WSL, install browser dependencies:

```bash
npx playwright install-deps chromium
```

For the real Windows tray experience, run `npm run tauri:dev` or `npm run tauri:build` from Windows PowerShell.

## Local data locations

Codex Meter keeps runtime data local:

```text
%APPDATA%\CodexMeter\status.json
%APPDATA%\CodexMeter\config.json
%APPDATA%\CodexMeter\history.jsonl
%USERPROFILE%\Desktop\codex-meter-manual-chrome-profile\
```

Do not commit these files or the browser profile. They may contain local session state or private webhook configuration.
