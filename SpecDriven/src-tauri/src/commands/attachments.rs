use crate::domain::error::{AppError, AppResult};
use crate::domain::models::Attachment;
use crate::domain::paths::sanitize_file_name;
use crate::domain::workspace::{require_root, ticket_dir};
use std::fs;
use std::time::SystemTime;
use tauri::AppHandle;

fn to_iso(t: SystemTime) -> Option<String> {
    let dt: chrono::DateTime<chrono::Local> = t.into();
    Some(dt.to_rfc3339())
}

#[tauri::command]
pub fn list_attachments(app: AppHandle, client: String, key: String) -> AppResult<Vec<Attachment>> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?.join("anexos");
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(dir)?.flatten() {
        if !entry.file_type()?.is_file() {
            continue;
        }
        let meta = entry.metadata()?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        out.push(Attachment {
            file_name,
            path: entry.path().to_string_lossy().to_string(),
            size: meta.len(),
            modified_at: meta.modified().ok().and_then(to_iso),
        });
    }
    out.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
pub fn add_attachment(
    app: AppHandle,
    client: String,
    key: String,
    source_path: String,
) -> AppResult<Attachment> {
    let root = require_root(&app)?;
    let ticket = ticket_dir(&root, &client, &key)?;
    if !ticket.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let source = std::path::PathBuf::from(&source_path);
    if !source.exists() || !source.is_file() {
        return Err(AppError::not_found("arquivo de origem"));
    }
    let file_name = sanitize_file_name(
        source
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("anexo"),
    )?;
    let dest_dir = ticket.join("anexos");
    fs::create_dir_all(&dest_dir)?;
    let mut dest = dest_dir.join(&file_name);
    if dest.exists() {
        let stem = dest.file_stem().and_then(|s| s.to_str()).unwrap_or("anexo");
        let ext = dest
            .extension()
            .and_then(|s| s.to_str())
            .map(|e| format!(".{e}"))
            .unwrap_or_default();
        let mut i = 1;
        loop {
            let candidate = dest_dir.join(format!("{stem}-{i}{ext}"));
            if !candidate.exists() {
                dest = candidate;
                break;
            }
            i += 1;
        }
    }
    fs::copy(&source, &dest)?;
    let meta = fs::metadata(&dest)?;
    Ok(Attachment {
        file_name: dest
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string(),
        path: dest.to_string_lossy().to_string(),
        size: meta.len(),
        modified_at: meta.modified().ok().and_then(to_iso),
    })
}

#[tauri::command]
pub fn remove_attachment(
    app: AppHandle,
    client: String,
    key: String,
    file_name: String,
) -> AppResult<()> {
    let root = require_root(&app)?;
    let clean = sanitize_file_name(&file_name)?;
    let path = ticket_dir(&root, &client, &key)?.join("anexos").join(&clean);
    if !path.exists() {
        return Err(AppError::not_found(&clean));
    }
    // Ensure still under anexos
    let anexos = ticket_dir(&root, &client, &key)?.join("anexos");
    let canon_file = fs::canonicalize(&path)?;
    let canon_anexos = fs::canonicalize(&anexos)?;
    if !canon_file.starts_with(&canon_anexos) {
        return Err(AppError::io_msg("Caminho de anexo inválido."));
    }
    fs::remove_file(path)?;
    Ok(())
}
