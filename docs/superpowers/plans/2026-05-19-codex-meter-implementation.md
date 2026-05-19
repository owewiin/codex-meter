# Codex Meter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows system-tray app that monitors ChatGPT/OpenAI Codex quota using a Playwright persistent profile and exposes the result through tray UI, local cache, and Discord webhook notifications.

**Architecture:** Tauri provides the desktop shell, tray menu, app-data IO, scheduler hooks, notifications, and Discord webhook sender. React/TypeScript provides the settings/status UI. A Node/TypeScript Playwright worker handles login/fetch and emits normalized JSON consumed by the Tauri backend.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, Vite, Node.js, Playwright, Vitest.

---

## Workspace / Target Guard

- Spec is stored in `docs/superpowers/specs/2026-05-19-codex-meter-design.md`.
- This implementation happens in the same repo: `C:\Users\oweewiin\Desktop\codex-quota-tray` (`/mnt/c/Users/oweewiin/Desktop/codex-quota-tray`).
- Paths in this plan are relative to the repo root.
- Current WSL environment has Node/npm but no Rust/Cargo visible. Tauri native build requires Rust; until Rust is installed, frontend/worker tests can run but `cargo`/`tauri build` will be blocked.

## File Structure

- Create `package.json`: npm scripts and dependencies for Vite, Vitest, Tauri CLI, worker tooling.
- Create `index.html`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`: React settings/status UI.
- Create `src/shared/types.ts`: shared config/status types used by UI and worker tests.
- Create `src/shared/status.ts`: status formatting and threshold logic.
- Create `src/shared/config.ts`: config defaults and validation.
- Create `worker/fetch-codex-quota.ts`: Node Playwright worker entrypoint with `login`, `fetch`, and fixture mode.
- Create `worker/parser.ts`: conservative parser for quota text/network payloads.
- Create `worker/parser.test.ts`: parser unit tests with fixtures.
- Create `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`: Tauri backend shell.
- Create `docs/usage.md`: MVP usage and troubleshooting.
- Create `.gitignore`: ignore node_modules, build artifacts, app data, logs, browser profiles.

## Task 1: Scaffold npm/Vite/React project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`

- [ ] **Step 1: Create package metadata and scripts**

Use scripts: `dev`, `build`, `test`, `worker:fixture`, `worker:login`, `worker:fetch`, `tauri:dev`, `tauri:build`.

- [ ] **Step 2: Add TypeScript/Vite config**

Configure React plugin and Vitest node/jsdom test environments.

- [ ] **Step 3: Run install**

Run: `npm install`
Expected: dependencies installed and `package-lock.json` created.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html .gitignore
git commit -m "chore: scaffold Codex Meter web workspace"
```

## Task 2: Shared config/status logic with tests

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/config.ts`
- Create: `src/shared/status.ts`
- Create: `src/shared/status.test.ts`

- [ ] **Step 1: Define types**

Define `CodexMeterConfig`, `CodexStatus`, `SuccessfulCodexStatus`, `FailedCodexStatus`, and `DiscordConfig`.

- [ ] **Step 2: Implement defaults and validation**

`normalizeConfig(input)` must clamp refresh interval to 5~240 minutes, threshold to 1~100, and default Discord settings safely.

- [ ] **Step 3: Implement formatting and transition logic**

`formatStatusTooltip(status)` and `shouldNotify(previous, next, config)` decide UI text and notification events.

- [ ] **Step 4: Write tests**

Cover default config, clamping, low quota, failure transition, recovery transition, and stale/failure formatting.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- --run src/shared/status.test.ts
git add src/shared
git commit -m "feat: add shared quota status logic"
```

## Task 3: Playwright worker and parser

**Files:**
- Create: `worker/parser.ts`
- Create: `worker/parser.test.ts`
- Create: `worker/fetch-codex-quota.ts`

- [ ] **Step 1: Implement parser tests first**

Parser must extract percent, reset text, plan text, and preserve raw text without inventing values.

- [ ] **Step 2: Implement parser**

`parseQuotaText(text)` returns success only if it finds a confident quota signal; otherwise returns `ok: false` with `PARSER_NO_MATCH`.

- [ ] **Step 3: Implement worker CLI**

Modes:
- `fixture --text "Codex 72% remaining resets in 3h"`
- `login --profile <path> --url <url>`
- `fetch --profile <path> --url <url>`

All modes emit exactly one JSON object to stdout.

- [ ] **Step 4: Run tests and fixture command**

```bash
npm test -- --run worker/parser.test.ts
npm run worker:fixture -- --text "Codex 72% remaining resets in 3h 12m ChatGPT Pro"
```

- [ ] **Step 5: Commit**

```bash
git add worker
 git commit -m "feat: add Playwright quota worker"
```

## Task 4: React status/settings UI

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Build UI using mock data fallback**

Show status card, config fields, action buttons, and Discord settings.

- [ ] **Step 2: Wire Tauri invoke wrappers with browser-safe fallback**

If Tauri APIs are unavailable, use local mock status so `npm run dev` works in browser.

- [ ] **Step 3: Build frontend**

Run: `npm run build`
Expected: Vite build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src index.html
 git commit -m "feat: add Codex Meter settings UI"
```

## Task 5: Tauri backend shell

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/icons/README.md`

- [ ] **Step 1: Add Tauri config**

Configure product name `Codex Meter`, identifier `tw.jason.codex-meter`, dev URL `http://localhost:5173`, and dist dir `../dist`.

- [ ] **Step 2: Add Rust backend commands**

Commands: `get_status`, `save_config`, `refresh_now`, `login`, `send_status_to_discord`. Initial backend may return mocked data until worker sidecar packaging is complete.

- [ ] **Step 3: Verify Rust availability**

Run: `cargo --version`. If missing, document blocker in final report and skip native build.

- [ ] **Step 4: Commit**

```bash
git add src-tauri
 git commit -m "feat: add Tauri backend shell"
```

## Task 6: Documentation and verification

**Files:**
- Create: `docs/usage.md`
- Modify: `README.md` if present or create it if absent.

- [ ] **Step 1: Document setup**

Include npm install, Playwright install, Rust/Tauri prerequisite, login flow, fixture test, and Discord webhook notes.

- [ ] **Step 2: Run verification**

```bash
npm test -- --run
npm run build
npm run worker:fixture -- --text "Codex 72% remaining resets in 3h 12m ChatGPT Pro"
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/usage.md
 git commit -m "docs: add Codex Meter usage guide"
```

## Self-review

- Spec coverage: MVP tray app architecture, Playwright profile, local cache, Discord webhook, UI, worker parser, and testing are represented.
- Placeholder scan: no TODO/TBD placeholders are used as implementation instructions.
- Type consistency: config/status naming is consistent across shared logic, worker, UI, and backend command plan.
- Scope: native slash command bot and multi-account support remain out of MVP, matching the design spec.
