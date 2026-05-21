#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{env, fs, path::PathBuf, process::Command, thread};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DiscordConfig {
    enabled: bool,
    webhook_url: String,
    notify_on_low_quota: bool,
    notify_on_fetch_failure: bool,
    notify_on_recovery: bool,
    notify_every_refresh: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NotificationConfig {
    windows_low_quota: bool,
    windows_fetch_failure: bool,
    windows_recovery: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CodexMeterConfig {
    usage_page_url: String,
    refresh_interval_minutes: u32,
    low_threshold_percent: u8,
    discord: DiscordConfig,
    notifications: NotificationConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CodexQuotaBucket {
    id: String,
    label: String,
    remaining_text: String,
    remaining_percent: u8,
    reset_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CodexStatus {
    ok: bool,
    source: String,
    remaining_text: Option<String>,
    remaining_percent: Option<u8>,
    reset_text: Option<String>,
    plan_text: Option<String>,
    buckets: Option<Vec<CodexQuotaBucket>>,
    error_code: Option<String>,
    error: Option<String>,
    fetched_at: String,
    usage_page_url: Option<String>,
    raw_text: Option<String>,
}

fn app_dir() -> Result<PathBuf, String> {
    let base = env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(PathBuf::from))
        .ok_or_else(|| "Cannot resolve APPDATA or HOME".to_string())?;
    let dir = base.join("CodexMeter");
    fs::create_dir_all(dir.join("logs")).map_err(|err| err.to_string())?;
    fs::create_dir_all(dir.join("playwright-profile")).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn default_config() -> CodexMeterConfig {
    CodexMeterConfig {
        usage_page_url: "https://chatgpt.com/codex/settings/usage".to_string(),
        refresh_interval_minutes: 15,
        low_threshold_percent: 20,
        discord: DiscordConfig {
            enabled: false,
            webhook_url: String::new(),
            notify_on_low_quota: true,
            notify_on_fetch_failure: true,
            notify_on_recovery: true,
            notify_every_refresh: false,
        },
        notifications: NotificationConfig {
            windows_low_quota: true,
            windows_fetch_failure: true,
            windows_recovery: true,
        },
    }
}

fn default_status() -> CodexStatus {
    CodexStatus {
        ok: false,
        source: "chatgpt_web".to_string(),
        remaining_text: None,
        remaining_percent: None,
        reset_text: None,
        plan_text: None,
        buckets: None,
        error_code: Some("LOGIN_REQUIRED".to_string()),
        error: Some("No cached status yet. Use Login / Re-login, then Refresh Now.".to_string()),
        fetched_at: Utc::now().to_rfc3339(),
        usage_page_url: Some("https://chatgpt.com/codex/settings/usage".to_string()),
        raw_text: None,
    }
}

#[tauri::command]
fn get_config() -> Result<CodexMeterConfig, String> {
    let path = app_dir()?.join("config.json");
    if !path.exists() {
        return Ok(default_config());
    }
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_config(config: CodexMeterConfig) -> Result<(), String> {
    let path = app_dir()?.join("config.json");
    let text = serde_json::to_string_pretty(&config).map_err(|err| err.to_string())?;
    fs::write(path, text).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_status() -> Result<CodexStatus, String> {
    let path = app_dir()?.join("status.json");
    if !path.exists() {
        return Ok(default_status());
    }
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&text).map_err(|err| err.to_string())
}

fn status_tooltip(status: &CodexStatus) -> String {
    if status.ok {
        let bucket_summary = status
            .buckets
            .clone()
            .unwrap_or_default()
            .iter()
            .map(|bucket| format!("{} {}%", bucket.label, bucket.remaining_percent))
            .collect::<Vec<_>>()
            .join(" / ");
        let quota_text = if bucket_summary.is_empty() {
            format!(
                "{}% remaining",
                status.remaining_percent.unwrap_or_default()
            )
        } else {
            bucket_summary
        };
        format!(
            "Codex Meter\n{}\n最後更新：{}",
            quota_text, status.fetched_at
        )
    } else {
        format!(
            "Codex Meter\n查詢失敗：{}\n最後嘗試：{}",
            status
                .error_code
                .clone()
                .unwrap_or_else(|| "UNKNOWN".to_string()),
            status.fetched_at
        )
    }
}

fn update_tray_tooltip(app: &AppHandle, status: &CodexStatus) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(status_tooltip(status)));
    }
}

fn write_status(status: &CodexStatus) -> Result<(), String> {
    let dir = app_dir()?;
    let mut sanitized = status.clone();
    // Avoid persisting raw page text by default. It is useful for parser debugging,
    // but the local cache/history should remain safe to inspect and share.
    sanitized.raw_text = None;
    let text = serde_json::to_string_pretty(&sanitized).map_err(|err| err.to_string())?;
    fs::write(dir.join("status.json"), &text).map_err(|err| err.to_string())?;
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("history.jsonl"))
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(
                file,
                "{}",
                serde_json::to_string(&sanitized).unwrap_or_default()
            )
        })
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn repo_root_from_tauri() -> Result<PathBuf, String> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .map(|path| path.to_path_buf())
        .ok_or_else(|| "Cannot resolve project root".to_string())
}

const CHROME_DEBUG_PORT: u16 = 9223;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
fn hide_console_window(command: &mut Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console_window(_command: &mut Command) {}

fn manual_chrome_profile() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|home| {
            home.join("Desktop")
                .join("codex-meter-manual-chrome-profile")
        })
        .ok_or_else(|| "Cannot resolve USERPROFILE for manual Chrome profile".to_string())
}

fn chrome_executable() -> PathBuf {
    let candidates = [
        env::var_os("PROGRAMFILES").map(PathBuf::from).map(|p| {
            p.join("Google")
                .join("Chrome")
                .join("Application")
                .join("chrome.exe")
        }),
        env::var_os("PROGRAMFILES(X86)")
            .map(PathBuf::from)
            .map(|p| {
                p.join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe")
            }),
        env::var_os("LOCALAPPDATA").map(PathBuf::from).map(|p| {
            p.join("Google")
                .join("Chrome")
                .join("Application")
                .join("chrome.exe")
        }),
    ];

    candidates
        .into_iter()
        .flatten()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("chrome.exe"))
}

fn npx_executable() -> &'static str {
    if cfg!(windows) {
        "npx.cmd"
    } else {
        "npx"
    }
}

fn open_manual_chrome(url: &str) -> Result<(), String> {
    let profile = manual_chrome_profile()?;
    fs::create_dir_all(&profile).map_err(|err| err.to_string())?;
    Command::new(chrome_executable())
        .args([
            format!("--user-data-dir={}", profile.to_string_lossy()),
            format!("--remote-debugging-port={CHROME_DEBUG_PORT}"),
            "--new-window".to_string(),
            url.to_string(),
        ])
        .spawn()
        .map_err(|err| format!("Failed to open Chrome login window: {err}"))?;
    Ok(())
}

fn run_worker(mode: &str, config: &CodexMeterConfig) -> Result<CodexStatus, String> {
    let profile = manual_chrome_profile()?;
    fs::create_dir_all(&profile).map_err(|err| err.to_string())?;
    let root = repo_root_from_tauri()?;
    let cdp_url = format!("http://127.0.0.1:{CHROME_DEBUG_PORT}");
    let mut command = Command::new(npx_executable());
    hide_console_window(&mut command);
    let output = command
        .current_dir(root)
        .arg("tsx")
        .arg("worker/fetch-codex-quota.ts")
        .arg(mode)
        .arg("--profile")
        .arg(profile.to_string_lossy().as_ref())
        .arg("--url")
        .arg(config.usage_page_url.as_str())
        .arg("--browser-channel")
        .arg("chrome")
        .arg("--cdp-url")
        .arg(cdp_url)
        .output()
        .map_err(|err| format!("Failed to launch worker: {err}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stdout.trim().is_empty() {
        return Err(format!("Worker produced no JSON. stderr={stderr}"));
    }
    serde_json::from_str(stdout.trim())
        .map_err(|err| format!("Worker JSON parse failed: {err}; stdout={stdout}; stderr={stderr}"))
}

#[tauri::command]
fn refresh_now(app: AppHandle, config: CodexMeterConfig) -> Result<CodexStatus, String> {
    let status = run_worker("fetch", &config).unwrap_or_else(|err| CodexStatus {
        ok: false,
        source: "chatgpt_web".to_string(),
        remaining_text: None,
        remaining_percent: None,
        reset_text: None,
        plan_text: None,
        buckets: None,
        error_code: Some("WORKER_ERROR".to_string()),
        error: Some(err),
        fetched_at: Utc::now().to_rfc3339(),
        usage_page_url: Some(config.usage_page_url.clone()),
        raw_text: None,
    });
    write_status(&status)?;
    update_tray_tooltip(&app, &status);
    Ok(status)
}

#[tauri::command]
fn login(config: CodexMeterConfig) -> Result<CodexStatus, String> {
    let status = match open_manual_chrome(&config.usage_page_url) {
        Ok(()) => CodexStatus {
            ok: false,
            source: "chatgpt_web".to_string(),
            remaining_text: None,
            remaining_percent: None,
            reset_text: None,
            plan_text: None,
            buckets: None,
            error_code: Some("LOGIN_REQUIRED".to_string()),
            error: Some(
                "Chrome login window opened. Finish ChatGPT login there, then click Refresh Now."
                    .to_string(),
            ),
            fetched_at: Utc::now().to_rfc3339(),
            usage_page_url: Some(config.usage_page_url.clone()),
            raw_text: None,
        },
        Err(err) => CodexStatus {
            ok: false,
            source: "chatgpt_web".to_string(),
            remaining_text: None,
            remaining_percent: None,
            reset_text: None,
            plan_text: None,
            buckets: None,
            error_code: Some("WORKER_ERROR".to_string()),
            error: Some(err),
            fetched_at: Utc::now().to_rfc3339(),
            usage_page_url: Some(config.usage_page_url.clone()),
            raw_text: None,
        },
    };
    write_status(&status)?;
    Ok(status)
}

#[tauri::command]
async fn send_status_to_discord(
    status: CodexStatus,
    config: CodexMeterConfig,
    manual: bool,
) -> Result<(), String> {
    if !manual && !config.discord.enabled {
        return Ok(());
    }
    if config.discord.webhook_url.trim().is_empty() {
        return Err("Discord webhook URL is empty".to_string());
    }
    let content = if status.ok {
        let bucket_lines = status
            .buckets
            .clone()
            .unwrap_or_default()
            .iter()
            .map(|bucket| {
                format!(
                    "{}：{}%（{}）",
                    bucket.label,
                    bucket.remaining_percent,
                    bucket
                        .reset_text
                        .clone()
                        .unwrap_or_else(|| "未顯示重置時間".to_string())
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let detail = if bucket_lines.is_empty() {
            format!(
                "剩餘：{}%\n重置：{}",
                status.remaining_percent.unwrap_or(0),
                status
                    .reset_text
                    .clone()
                    .unwrap_or_else(|| "圖中未顯示".to_string())
            )
        } else {
            format!(
                "{}\n主要告警值：{}%",
                bucket_lines,
                status.remaining_percent.unwrap_or(0)
            )
        };
        format!(
            "Codex 額度狀態\n\n{}\n最後更新：{}",
            detail, status.fetched_at
        )
    } else {
        format!(
            "Codex 額度查詢失敗\n\n原因：{}\n最後嘗試：{}",
            status.error.unwrap_or_else(|| "Unknown error".to_string()),
            status.fetched_at
        )
    };
    let body = serde_json::json!({ "content": content });
    let response = reqwest::Client::new()
        .post(config.discord.webhook_url)
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Discord webhook failed: {}", response.status()));
    }
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn refresh_from_tray(app: AppHandle) {
    thread::spawn(move || {
        let config = get_config().unwrap_or_else(|_| default_config());
        let status = run_worker("fetch", &config).unwrap_or_else(|err| CodexStatus {
            ok: false,
            source: "chatgpt_web".to_string(),
            remaining_text: None,
            remaining_percent: None,
            reset_text: None,
            plan_text: None,
            buckets: None,
            error_code: Some("WORKER_ERROR".to_string()),
            error: Some(err),
            fetched_at: Utc::now().to_rfc3339(),
            usage_page_url: Some(config.usage_page_url.clone()),
            raw_text: None,
        });
        let _ = write_status(&status);
        update_tray_tooltip(&app, &status);
        let _ = app.emit("codex-status-updated", status);
    });
}

fn login_from_tray(_app: &AppHandle) {
    let config = get_config().unwrap_or_else(|_| default_config());
    let _ = open_manual_chrome(&config.usage_page_url);
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Open Codex Meter", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide Window", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh Now", true, None::<&str>)?;
    let login = MenuItem::with_id(app, "login", "Login / Re-login", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &hide,
            &PredefinedMenuItem::separator(app)?,
            &refresh,
            &login,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;
    let tooltip = get_status()
        .map(|status| status_tooltip(&status))
        .unwrap_or_else(|_| "Codex Meter\n尚未抓取額度".to_string());
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip(tooltip)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "hide" => hide_main_window(app),
            "refresh" => refresh_from_tray(app.clone()),
            "login" => login_from_tray(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            get_status,
            refresh_now,
            login,
            send_status_to_discord
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex Meter");
}

fn main() {
    run();
}
