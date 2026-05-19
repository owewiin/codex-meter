use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{env, fs, path::PathBuf, process::Command};

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
        usage_page_url: "https://chatgpt.com/".to_string(),
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
        usage_page_url: Some("https://chatgpt.com/".to_string()),
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

fn write_status(status: &CodexStatus) -> Result<(), String> {
    let dir = app_dir()?;
    let text = serde_json::to_string_pretty(status).map_err(|err| err.to_string())?;
    fs::write(dir.join("status.json"), &text).map_err(|err| err.to_string())?;
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("history.jsonl"))
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "{}", serde_json::to_string(status).unwrap_or_default())
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

fn run_worker(mode: &str, config: &CodexMeterConfig) -> Result<CodexStatus, String> {
    let dir = app_dir()?;
    let profile = dir.join("playwright-profile");
    let root = repo_root_from_tauri()?;
    let output = Command::new("npx")
        .current_dir(root)
        .args([
            "tsx",
            "worker/fetch-codex-quota.ts",
            mode,
            "--profile",
            profile.to_string_lossy().as_ref(),
            "--url",
            config.usage_page_url.as_str(),
        ])
        .output()
        .map_err(|err| format!("Failed to launch worker: {err}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stdout.trim().is_empty() {
        return Err(format!("Worker produced no JSON. stderr={stderr}"));
    }
    serde_json::from_str(stdout.trim()).map_err(|err| format!("Worker JSON parse failed: {err}; stdout={stdout}; stderr={stderr}"))
}

#[tauri::command]
fn refresh_now(config: CodexMeterConfig) -> Result<CodexStatus, String> {
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
    Ok(status)
}

#[tauri::command]
fn login(config: CodexMeterConfig) -> Result<CodexStatus, String> {
    let status = run_worker("login", &config).unwrap_or_else(|err| CodexStatus {
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
    Ok(status)
}

#[tauri::command]
async fn send_status_to_discord(status: CodexStatus, config: CodexMeterConfig, manual: bool) -> Result<(), String> {
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
                    bucket.reset_text.clone().unwrap_or_else(|| "未顯示重置時間".to_string())
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let detail = if bucket_lines.is_empty() {
            format!(
                "剩餘：{}%\n重置：{}",
                status.remaining_percent.unwrap_or(0),
                status.reset_text.clone().unwrap_or_else(|| "圖中未顯示".to_string())
            )
        } else {
            format!("{}\n主要告警值：{}%", bucket_lines, status.remaining_percent.unwrap_or(0))
        };
        format!("Codex 額度狀態\n\n{}\n最後更新：{}", detail, status.fetched_at)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
