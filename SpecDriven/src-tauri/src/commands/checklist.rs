use crate::domain::error::{AppError, AppResult};
use crate::domain::models::Checklist;
use crate::domain::workspace::{read_checklist, require_root, ticket_dir, write_checklist};
use tauri::AppHandle;

#[tauri::command]
pub fn get_checklist(app: AppHandle, client: String, key: String) -> AppResult<Checklist> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    read_checklist(&dir)
}

#[tauri::command]
pub fn save_checklist(
    app: AppHandle,
    client: String,
    key: String,
    checklist: Checklist,
) -> AppResult<Checklist> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    write_checklist(&dir, &checklist)?;
    Ok(checklist)
}
