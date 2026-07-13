use crate::domain::error::{AppError, AppResult};
use crate::domain::workspace::{read_notes, require_root, ticket_dir, write_notes};
use tauri::AppHandle;

#[tauri::command]
pub fn read_notes_cmd(app: AppHandle, client: String, key: String) -> AppResult<String> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    read_notes(&dir)
}

#[tauri::command]
pub fn write_notes_cmd(
    app: AppHandle,
    client: String,
    key: String,
    content: String,
) -> AppResult<()> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    write_notes(&dir, &content)
}
