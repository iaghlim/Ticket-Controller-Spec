use crate::domain::config::{load_config, push_recent_root, save_config};
use crate::domain::error::AppResult;
use crate::domain::models::AppConfig;
use crate::domain::workspace::{ensure_workspace_marker, scan_workspace};
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub fn get_config(app: AppHandle) -> AppResult<AppConfig> {
    load_config(&app)
}

#[tauri::command]
pub fn set_root_path(app: AppHandle, path: String) -> AppResult<AppConfig> {
    let p = PathBuf::from(path.trim());
    if !p.exists() || !p.is_dir() {
        return Err(crate::domain::error::AppError::io_msg(
            "A pasta informada não existe ou não é um diretório.",
        ));
    }
    ensure_workspace_marker(&p)?;
    let mut cfg = load_config(&app)?;
    let root = p.to_string_lossy().to_string();
    cfg.root_path = Some(root.clone());
    push_recent_root(&mut cfg, &root);
    save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn update_config(
    app: AppHandle,
    author_default: Option<String>,
    empty_placeholder: Option<String>,
    theme: Option<String>,
    cloud_mode: Option<String>,
    cloud_api_url: Option<String>,
    cloud_token: Option<String>,
    cloud_email: Option<String>,
    cloud_last_sync_at: Option<String>,
) -> AppResult<AppConfig> {
    let mut cfg = load_config(&app)?;
    if let Some(a) = author_default {
        cfg.author_default = a;
    }
    if let Some(e) = empty_placeholder {
        cfg.empty_placeholder = e;
    }
    if let Some(t) = theme {
        cfg.ui.theme = t;
    }
    if let Some(m) = cloud_mode {
        cfg.cloud.mode = m;
    }
    if let Some(u) = cloud_api_url {
        cfg.cloud.api_url = u;
    }
    if let Some(t) = cloud_token {
        cfg.cloud.token = if t.is_empty() { None } else { Some(t) };
    }
    if let Some(e) = cloud_email {
        cfg.cloud.email = if e.is_empty() { None } else { Some(e) };
    }
    if let Some(s) = cloud_last_sync_at {
        cfg.cloud.last_sync_at = if s.is_empty() { None } else { Some(s) };
    }
    save_config(&app, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn scan_workspace_cmd(app: AppHandle) -> AppResult<crate::domain::models::WorkspaceTree> {
    scan_workspace(&app)
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| {
            crate::domain::error::AppError::io_msg(format!(
                "Não foi possível abrir o caminho: {e}"
            ))
        })?;
    Ok(())
}
