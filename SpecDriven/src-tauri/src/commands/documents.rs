use crate::docx::{
    generate_from_template, load_print_images, resolve_prints_dir, validate_required,
};
use crate::domain::config::load_config;
use crate::domain::error::{AppError, AppResult};
use crate::domain::models::{
    now_iso, DocumentHistoryEntry, DocumentSource, DraftPayload, DraftPrint, DraftPrintsPayload,
    GenerateResult, TicketDetail,
};
use crate::domain::paths::sanitize_file_name;
use crate::domain::workspace::{
    doc_output_dir_rel, doc_output_rel, doc_stem, document_info_mut, draft_file_name,
    load_ticket_detail, normalize_doc_type, read_json, read_meta, require_root, template_file_name,
    ticket_dir, unique_rel_path, write_json, write_meta,
};
use base64::Engine as _;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const MAX_PRINTS: usize = 10;
const PRINTS_META: &str = "prints.json";

fn value_map_to_strings(data: &HashMap<String, Value>) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (k, v) in data {
        let s = match v {
            Value::Null => String::new(),
            Value::String(s) => s.clone(),
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            other => other.to_string(),
        };
        out.insert(k.clone(), s);
    }
    out
}

fn resolve_template_path(app: &AppHandle, doc_type: &str) -> AppResult<PathBuf> {
    let file = template_file_name(doc_type)?;
    if let Ok(resource) = app.path().resource_dir() {
        let p = resource.join("templates").join(file);
        if p.exists() {
            return Ok(p);
        }
        let p2 = resource.join(file);
        if p2.exists() {
            return Ok(p2);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("templates")
        .join(file);
    if dev.exists() {
        return Ok(dev);
    }
    Err(AppError::template(format!(
        "Template não encontrado: {file}. Verifique src-tauri/templates/."
    )))
}

fn next_version_n(history_len: usize) -> u32 {
    (history_len as u32).saturating_add(1)
}

fn push_history_and_activate(
    info: &mut crate::domain::models::DocumentInfo,
    file_name: String,
    rel_path: String,
    source: DocumentSource,
    draft_version: Option<u32>,
) -> DocumentHistoryEntry {
    let created_at = now_iso();
    let entry = DocumentHistoryEntry {
        id: Uuid::new_v4().to_string(),
        file_name,
        path: rel_path.clone(),
        source,
        created_at: created_at.clone(),
        label: None,
    };
    info.history.push(entry.clone());
    info.active_history_id = Some(entry.id.clone());
    info.exists = true;
    info.path = Some(rel_path);
    info.generated_at = Some(created_at);
    if let Some(v) = draft_version {
        info.draft_version = Some(v);
    }
    entry
}

fn prints_meta_path(prints_dir: &std::path::Path) -> PathBuf {
    prints_dir.join(PRINTS_META)
}

fn read_prints_meta(prints_dir: &std::path::Path) -> AppResult<DraftPrintsPayload> {
    let path = prints_meta_path(prints_dir);
    if !path.exists() {
        return Ok(DraftPrintsPayload {
            schema_version: 1,
            prints: Vec::new(),
        });
    }
    read_json(&path)
}

fn write_prints_meta(prints_dir: &std::path::Path, payload: &DraftPrintsPayload) -> AppResult<()> {
    fs::create_dir_all(prints_dir)?;
    write_json(&prints_meta_path(prints_dir), payload)
}

fn allow_print_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg")
}

fn unique_print_name(dir: &std::path::Path, preferred: &str) -> AppResult<String> {
    let safe = sanitize_file_name(preferred)?;
    let stem = PathBuf::from(&safe)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "print".into());
    let ext = PathBuf::from(&safe)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let mut n = 0u32;
    loop {
        let name = if n == 0 {
            format!("{stem}.{ext}")
        } else {
            format!("{stem}-{n}.{ext}")
        };
        if !dir.join(&name).exists() {
            return Ok(name);
        }
        n += 1;
        if n > 500 {
            return Err(AppError::io_msg(
                "Não foi possível gerar nome único para o print.",
            ));
        }
    }
}

#[tauri::command]
pub fn read_draft(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
) -> AppResult<DraftPayload> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let file = draft_file_name(dtype)?;
    let path = ticket_dir(&root, &client, &key)?.join("drafts").join(file);
    if !path.exists() {
        return Ok(DraftPayload {
            doc_type: dtype.to_string(),
            version: 1,
            data: HashMap::new(),
            updated_at: now_iso(),
        });
    }
    read_json(&path)
}

#[tauri::command]
pub fn save_draft(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
    data: HashMap<String, Value>,
    version: Option<u32>,
) -> AppResult<DraftPayload> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let file = draft_file_name(dtype)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let path = dir.join("drafts").join(file);
    let existing: Option<DraftPayload> = if path.exists() {
        read_json(&path).ok()
    } else {
        None
    };
    let next_version = version.unwrap_or_else(|| {
        existing.map(|e| e.version.saturating_add(1)).unwrap_or(1)
    });
    let payload = DraftPayload {
        doc_type: dtype.to_string(),
        version: next_version,
        data,
        updated_at: now_iso(),
    };
    write_json(&path, &payload)?;

    if let Ok(mut meta) = read_meta(&dir) {
        meta.updated_at = now_iso();
        let _ = write_meta(&dir, &meta);
    }
    Ok(payload)
}

#[tauri::command]
pub fn list_draft_prints(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
) -> AppResult<DraftPrintsPayload> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    let prints_dir = resolve_prints_dir(&dir, dtype)?;
    read_prints_meta(&prints_dir)
}

#[tauri::command]
pub fn add_draft_print(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
    source_path: String,
    caption: Option<String>,
) -> AppResult<DraftPrintsPayload> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let prints_dir = resolve_prints_dir(&dir, dtype)?;
    fs::create_dir_all(&prints_dir)?;
    let mut meta = read_prints_meta(&prints_dir)?;
    if meta.prints.len() >= MAX_PRINTS {
        return Err(AppError::validation(format!(
            "Limite de {MAX_PRINTS} prints por documento."
        )));
    }

    let source = PathBuf::from(&source_path);
    if !source.exists() || !source.is_file() {
        return Err(AppError::not_found("arquivo de print"));
    }
    let ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !allow_print_ext(&ext) {
        return Err(AppError::validation(
            "Formato inválido. Use .png, .jpg ou .jpeg.",
        ));
    }
    let preferred = source
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("print.png");
    let file_name = unique_print_name(&prints_dir, preferred)?;
    fs::copy(&source, prints_dir.join(&file_name))?;

    meta.prints.push(DraftPrint {
        id: Uuid::new_v4().to_string(),
        file_name,
        caption,
        created_at: now_iso(),
    });
    write_prints_meta(&prints_dir, &meta)?;
    Ok(meta)
}

#[tauri::command]
pub fn add_draft_print_bytes(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
    file_name: String,
    base64_data: String,
    caption: Option<String>,
) -> AppResult<DraftPrintsPayload> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let prints_dir = resolve_prints_dir(&dir, dtype)?;
    fs::create_dir_all(&prints_dir)?;
    let mut meta = read_prints_meta(&prints_dir)?;
    if meta.prints.len() >= MAX_PRINTS {
        return Err(AppError::validation(format!(
            "Limite de {MAX_PRINTS} prints por documento."
        )));
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.trim())
        .map_err(|_| AppError::validation("Dados do print inválidos (base64)."))?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err(AppError::validation("Print maior que 12 MB."));
    }

    let preferred = if file_name.trim().is_empty() {
        "print.png".into()
    } else {
        file_name
    };
    let safe_name = unique_print_name(&prints_dir, &preferred)?;
    let ext = PathBuf::from(&safe_name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !allow_print_ext(&ext) {
        return Err(AppError::validation(
            "Formato inválido. Use .png, .jpg ou .jpeg.",
        ));
    }
    fs::write(prints_dir.join(&safe_name), &bytes)?;

    meta.prints.push(DraftPrint {
        id: Uuid::new_v4().to_string(),
        file_name: safe_name,
        caption,
        created_at: now_iso(),
    });
    write_prints_meta(&prints_dir, &meta)?;
    Ok(meta)
}

#[tauri::command]
pub fn remove_draft_print(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
    print_id: String,
) -> AppResult<DraftPrintsPayload> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    let prints_dir = resolve_prints_dir(&dir, dtype)?;
    let mut meta = read_prints_meta(&prints_dir)?;
    if let Some(pos) = meta.prints.iter().position(|p| p.id == print_id) {
        let removed = meta.prints.remove(pos);
        let path = prints_dir.join(&removed.file_name);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
        write_prints_meta(&prints_dir, &meta)?;
    }
    Ok(meta)
}

#[tauri::command]
pub fn generate_document(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
) -> AppResult<GenerateResult> {
    let root = require_root(&app)?;
    let cfg = load_config(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }

    let draft_path = dir.join("drafts").join(draft_file_name(dtype)?);
    if !draft_path.exists() {
        return Err(AppError::validation(
            "Não há draft salvo. Preencha e salve o formulário antes de gerar.",
        ));
    }
    let draft: DraftPayload = read_json(&draft_path)?;
    let mut values = value_map_to_strings(&draft.data);

    let meta = read_meta(&dir)?;
    values.entry("cliente".into()).or_insert(meta.client.clone());
    values.entry("chave".into()).or_insert(meta.key.clone());
    values.entry("titulo".into()).or_insert(meta.title.clone());
    values.entry("autor".into()).or_insert_with(|| {
        if meta.author.is_empty() {
            cfg.author_default.clone()
        } else {
            meta.author.clone()
        }
    });
    values
        .entry("data".into())
        .or_insert_with(|| chrono::Local::now().format("%d/%m/%Y").to_string());
    values.entry("versao".into()).or_insert_with(|| "1.0".into());
    if let Some(url) = &meta.jira_url {
        values.entry("jira_url".into()).or_insert(url.clone());
    }

    validate_required(dtype, &values)?;

    let prints_dir = resolve_prints_dir(&dir, dtype)?;
    let prints_meta = read_prints_meta(&prints_dir)?;
    let images = load_print_images(&prints_dir, &prints_meta.prints)?;

    let mut meta = read_meta(&dir)?;
    let info = document_info_mut(&mut meta, dtype)?;
    let version_n = next_version_n(info.history.len());
    let stem = doc_stem(dtype)?;
    let dir_rel = doc_output_dir_rel(dtype)?;
    let versioned_name = format!("{stem}_v{version_n}.docx");
    let (versioned_rel, versioned_dest) = unique_rel_path(&dir, dir_rel, &versioned_name)?;

    let template_path = resolve_template_path(&app, dtype)?;
    let bytes = fs::read(&template_path).map_err(|e| {
        AppError::template(format!(
            "Falha ao ler template {}: {e}",
            template_path.display()
        ))
    })?;

    let empty = if cfg.empty_placeholder.is_empty() {
        "—"
    } else {
        cfg.empty_placeholder.as_str()
    };
    generate_from_template(&bytes, &values, empty, &versioned_dest, &images)?;

    let latest_rel = doc_output_rel(dtype)?;
    let latest_dest = dir.join(latest_rel);
    if let Some(parent) = latest_dest.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(&versioned_dest, &latest_dest).map_err(|e| {
        AppError::io_msg(format!(
            "Documento gerado, mas falha ao atualizar cópia latest: {e}"
        ))
    })?;

    let entry = push_history_and_activate(
        info,
        versioned_dest
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or(versioned_name),
        versioned_rel,
        DocumentSource::Generated,
        Some(draft.version),
    );
    meta.updated_at = entry.created_at.clone();
    write_meta(&dir, &meta)?;

    Ok(GenerateResult {
        path: versioned_dest.to_string_lossy().to_string(),
        generated_at: entry.created_at,
    })
}

/// Lê arquivo sob a pasta raiz do workspace e devolve base64 (ex.: upload cloud de .docx).
#[tauri::command]
pub fn read_workspace_file_base64(app: AppHandle, path: String) -> AppResult<String> {
    let root = require_root(&app)?;
    let target = PathBuf::from(&path);
    let canon_root = root
        .canonicalize()
        .map_err(|e| AppError::io_msg(format!("Raiz inválida: {e}")))?;
    let canon_target = target
        .canonicalize()
        .map_err(|_| AppError::not_found(&path))?;
    if !canon_target.starts_with(&canon_root) {
        return Err(AppError::validation(
            "Caminho fora da pasta raiz do workspace.",
        ));
    }
    if !canon_target.is_file() {
        return Err(AppError::not_found(&path));
    }
    let bytes = fs::read(&canon_target)
        .map_err(|e| AppError::io_msg(format!("Falha ao ler arquivo: {e}")))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn attach_document(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
    source_path: String,
) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }

    let source = PathBuf::from(&source_path);
    if !source.exists() || !source.is_file() {
        return Err(AppError::not_found("arquivo de origem"));
    }

    let ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = ["docx", "doc", "odt", "rtf"];
    if !allowed.iter().any(|a| *a == ext) {
        return Err(AppError::validation(
            "Formato inválido. Use .docx, .doc, .odt ou .rtf.",
        ));
    }

    let original_name = sanitize_file_name(
        source
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("documento.docx"),
    )?;
    let dir_rel = doc_output_dir_rel(dtype)?;
    let (rel, dest) = unique_rel_path(&dir, dir_rel, &original_name)?;
    fs::copy(&source, &dest)
        .map_err(|e| AppError::io_msg(format!("Falha ao copiar documento anexado: {e}")))?;

    if ext == "docx" {
        let latest_rel = doc_output_rel(dtype)?;
        let latest_dest = dir.join(latest_rel);
        if let Some(parent) = latest_dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let _ = fs::copy(&dest, &latest_dest);
    }

    let mut meta = read_meta(&dir)?;
    let info = document_info_mut(&mut meta, dtype)?;
    let file_name = dest
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or(original_name);
    let entry = push_history_and_activate(info, file_name, rel, DocumentSource::Attached, None);
    meta.updated_at = entry.created_at;
    write_meta(&dir, &meta)?;

    load_ticket_detail(&root, &client, &key)
}

#[tauri::command]
pub fn set_active_document_history(
    app: AppHandle,
    client: String,
    key: String,
    doc_type: String,
    history_id: String,
) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    let dtype = normalize_doc_type(&doc_type)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }

    let mut meta = read_meta(&dir)?;
    let info = document_info_mut(&mut meta, dtype)?;
    let entry = info
        .history
        .iter()
        .find(|h| h.id == history_id)
        .cloned()
        .ok_or_else(|| AppError::not_found("versão do documento no histórico"))?;

    if !dir.join(&entry.path).exists() {
        return Err(AppError::not_found(&format!(
            "arquivo do histórico: {}",
            entry.file_name
        )));
    }

    info.active_history_id = Some(entry.id);
    info.path = Some(entry.path.clone());
    info.generated_at = Some(entry.created_at.clone());
    info.exists = true;
    meta.updated_at = now_iso();
    write_meta(&dir, &meta)?;

    load_ticket_detail(&root, &client, &key)
}
