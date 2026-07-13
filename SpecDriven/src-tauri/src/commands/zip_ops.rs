use crate::domain::error::{AppError, AppResult};
use crate::domain::models::TicketDetail;
use crate::domain::paths::{sanitize_client_name, validate_jira_key};
use crate::domain::workspace::{
    create_ticket_tree, load_ticket_detail, require_root, ticket_dir, write_meta,
};
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

fn add_dir_to_zip(zip: &mut ZipWriter<fs::File>, base: &Path, dir: &Path) -> AppResult<()> {
    for entry in WalkDir::new(dir) {
        let entry = entry.map_err(|e| AppError::io_msg(e.to_string()))?;
        let path = entry.path();
        let rel = path.strip_prefix(base).unwrap_or(path);
        let name = rel.to_string_lossy().replace('\\', "/");
        if entry.file_type().is_dir() {
            if !name.is_empty() {
                zip.add_directory(format!("{name}/"), SimpleFileOptions::default())?;
            }
            continue;
        }
        let mut file = fs::File::open(path)?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        zip.start_file(
            name,
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )?;
        zip.write_all(&buf)?;
    }
    Ok(())
}

#[tauri::command]
pub fn export_ticket_zip(
    app: AppHandle,
    client: String,
    key: String,
    dest_path: String,
) -> AppResult<serde_json::Value> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let dest = PathBuf::from(&dest_path);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let file = fs::File::create(&dest)?;
    let mut zip = ZipWriter::new(file);
    add_dir_to_zip(&mut zip, &dir, &dir)?;
    zip.finish()?;
    Ok(serde_json::json!({ "path": dest.to_string_lossy() }))
}

fn validate_zip_entry_name(name: &str) -> AppResult<()> {
    let path = Path::new(name);
    if path.is_absolute() {
        return Err(AppError::validation(
            "ZIP inválido: contém caminho absoluto.",
        ));
    }
    for c in path.components() {
        if matches!(c, Component::ParentDir) {
            return Err(AppError::validation(
                "ZIP inválido: contém '..' (path traversal).",
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn import_ticket_zip(
    app: AppHandle,
    zip_path: String,
    client: String,
) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    let client = sanitize_client_name(&client)?;
    let client_path = root.join(&client);
    if !client_path.exists() {
        fs::create_dir_all(&client_path)?;
    }

    let file = fs::File::open(&zip_path).map_err(|_| {
        AppError::not_found("arquivo ZIP")
    })?;
    let mut archive = ZipArchive::new(file)?;

    // Find meta.json to get key
    let mut meta_bytes: Option<Vec<u8>> = None;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i)?;
        let name = f.name().replace('\\', "/");
        validate_zip_entry_name(&name)?;
        if name == "meta.json" || name.ends_with("/meta.json") {
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)?;
            meta_bytes = Some(buf);
            break;
        }
    }
    let Some(meta_raw) = meta_bytes else {
        return Err(AppError::validation(
            "ZIP inválido: meta.json não encontrado na raiz do chamado.",
        ));
    };
    let mut meta: crate::domain::models::TicketMeta = serde_json::from_slice(&meta_raw)?;
    validate_jira_key(&meta.key)?;

    let dest = ticket_dir(&root, &client, &meta.key)?;
    if dest.exists() {
        return Err(AppError::conflict(format!(
            "Já existe o chamado {}/{} — importe com outra chave ou exclua o existente.",
            client, meta.key
        )));
    }
    create_ticket_tree(&dest)?;

    // Re-open archive to extract (meta already consumed from first pass — reopen)
    let file = fs::File::open(&zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i)?;
        let name = f.name().replace('\\', "/");
        validate_zip_entry_name(&name)?;
        // Strip leading folder if zip was created with parent folder
        let rel = if let Some(stripped) = name.strip_prefix(&format!("{}/", meta.key)) {
            stripped.to_string()
        } else {
            name.clone()
        };
        if rel.is_empty() || rel.ends_with('/') {
            if !rel.is_empty() {
                fs::create_dir_all(dest.join(&rel))?;
            }
            continue;
        }
        let out_path = dest.join(&rel);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut outfile = fs::File::create(&out_path)?;
        std::io::copy(&mut f, &mut outfile)?;
    }

    meta.client = client.clone();
    meta.updated_at = crate::domain::models::now_iso();
    write_meta(&dest, &meta)?;
    load_ticket_detail(&root, &client, &meta.key)
}
