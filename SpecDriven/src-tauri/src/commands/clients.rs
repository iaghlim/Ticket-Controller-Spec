use crate::domain::error::{AppError, AppResult};
use crate::domain::models::ClientSummary;
use crate::domain::paths::sanitize_client_name;
use crate::domain::workspace::{client_dir, require_root};
use std::fs;
use tauri::AppHandle;

#[tauri::command]
pub fn create_client(app: AppHandle, name: String) -> AppResult<ClientSummary> {
    let root = require_root(&app)?;
    let clean = sanitize_client_name(&name)?;
    let dir = client_dir(&root, &clean)?;
    if dir.exists() {
        return Err(AppError::already_exists(&clean));
    }
    fs::create_dir_all(&dir).map_err(|e| {
        AppError::io_msg(format!(
            "Não foi possível criar a pasta do cliente '{clean}' em {}: {e}",
            root.display()
        ))
    })?;
    Ok(ClientSummary {
        name: clean,
        ticket_count: 0,
        path: dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn rename_client(app: AppHandle, old: String, new_name: String) -> AppResult<ClientSummary> {
    let root = require_root(&app)?;
    let old_clean = sanitize_client_name(&old)?;
    let new_clean = sanitize_client_name(&new_name)?;
    let from = client_dir(&root, &old_clean)?;
    let to = client_dir(&root, &new_clean)?;
    if !from.exists() {
        return Err(AppError::not_found(&old_clean));
    }
    if to.exists() {
        return Err(AppError::already_exists(&new_clean));
    }
    fs::rename(&from, &to)?;

    // Update client field in all ticket metas
    if let Ok(entries) = fs::read_dir(&to) {
        for entry in entries.flatten() {
            if entry.file_type().map(|f| f.is_dir()).unwrap_or(false) {
                let meta_path = entry.path().join("meta.json");
                if meta_path.exists() {
                    if let Ok(mut meta) =
                        crate::domain::workspace::read_meta(&entry.path())
                    {
                        meta.client = new_clean.clone();
                        meta.updated_at = crate::domain::models::now_iso();
                        let _ = crate::domain::workspace::write_meta(&entry.path(), &meta);
                    }
                }
            }
        }
    }

    let ticket_count = fs::read_dir(&to)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|f| f.is_dir()).unwrap_or(false))
        .count();

    Ok(ClientSummary {
        name: new_clean,
        ticket_count,
        path: to.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn delete_client(app: AppHandle, name: String, confirm_name: String) -> AppResult<()> {
    let root = require_root(&app)?;
    let clean = sanitize_client_name(&name)?;
    if confirm_name.trim() != clean {
        return Err(AppError::validation(
            "Confirmação inválida. Digite o nome do cliente exatamente para excluir.",
        ));
    }
    let dir = client_dir(&root, &clean)?;
    if !dir.exists() {
        return Err(AppError::not_found(&clean));
    }
    fs::remove_dir_all(&dir)?;
    Ok(())
}
