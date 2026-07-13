use crate::domain::error::{AppError, AppResult};
use crate::domain::models::AppConfig;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn config_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::io_msg(format!("Não foi possível obter pasta de config: {e}")))?;
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir.join("config.json"))
}

pub fn load_config(app: &AppHandle) -> AppResult<AppConfig> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&path)?;
    let cfg: AppConfig = serde_json::from_str(&raw)?;
    Ok(cfg)
}

pub fn save_config(app: &AppHandle, cfg: &AppConfig) -> AppResult<()> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(cfg)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn push_recent_root(cfg: &mut AppConfig, root: &str) {
    cfg.recent_roots.retain(|r| r != root);
    cfg.recent_roots.insert(0, root.to_string());
    cfg.recent_roots.truncate(5);
}
