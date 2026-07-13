use crate::domain::config::load_config;
use crate::domain::error::{AppError, AppResult};
use crate::domain::models::{
    default_checklist, now_iso, Checklist, ClientSummary, DocumentsMeta, TicketDetail, TicketMeta,
    TicketStatus, TicketSummary, WorkspaceMeta, WorkspaceTree,
};
use crate::domain::paths::{sanitize_client_name, validate_jira_key};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub fn require_root(app: &AppHandle) -> AppResult<PathBuf> {
    let cfg = load_config(app)?;
    let Some(root) = cfg.root_path.filter(|p| !p.trim().is_empty()) else {
        return Err(AppError::root_not_set());
    };
    let path = PathBuf::from(&root);
    if !path.exists() {
        return Err(AppError::io_msg(format!(
            "Pasta raiz não existe mais: {root}"
        )));
    }
    Ok(path)
}

pub fn client_dir(root: &Path, client: &str) -> AppResult<PathBuf> {
    let name = sanitize_client_name(client)?;
    Ok(root.join(name))
}

pub fn ticket_dir(root: &Path, client: &str, key: &str) -> AppResult<PathBuf> {
    validate_jira_key(key)?;
    Ok(client_dir(root, client)?.join(key))
}

pub fn ensure_workspace_marker(root: &Path) -> AppResult<()> {
    let marker_dir = root.join(".specdriven");
    let marker = marker_dir.join("workspace.json");
    if !marker.exists() {
        fs::create_dir_all(&marker_dir)?;
        // Write probe to validate write permission
        let probe = marker_dir.join(".write_test");
        fs::write(&probe, b"ok").map_err(|_| {
            AppError::io_msg(
                "Sem permissão de escrita na pasta escolhida. Escolha outra pasta.",
            )
        })?;
        let _ = fs::remove_file(&probe);
        let meta = WorkspaceMeta {
            schema_version: 1,
            created_at: now_iso(),
        };
        fs::write(marker, serde_json::to_string_pretty(&meta)?)?;
    }
    Ok(())
}

pub fn create_ticket_tree(dir: &Path) -> AppResult<()> {
    for sub in ["drafts", "docs", "testes", "anexos"] {
        fs::create_dir_all(dir.join(sub))?;
    }
    Ok(())
}

pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> AppResult<T> {
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw)?)
}

pub fn read_meta(dir: &Path) -> AppResult<TicketMeta> {
    read_json(&dir.join("meta.json"))
}

pub fn write_meta(dir: &Path, meta: &TicketMeta) -> AppResult<()> {
    write_json(&dir.join("meta.json"), meta)
}

pub fn read_checklist(dir: &Path) -> AppResult<Checklist> {
    let path = dir.join("checklist.json");
    if !path.exists() {
        let cl = default_checklist();
        write_json(&path, &cl)?;
        return Ok(cl);
    }
    read_json(&path)
}

pub fn write_checklist(dir: &Path, checklist: &Checklist) -> AppResult<()> {
    write_json(&dir.join("checklist.json"), checklist)
}

pub fn read_notes(dir: &Path) -> AppResult<String> {
    let path = dir.join("notas.md");
    if !path.exists() {
        fs::write(&path, "")?;
        return Ok(String::new());
    }
    Ok(fs::read_to_string(path)?)
}

pub fn write_notes(dir: &Path, content: &str) -> AppResult<()> {
    fs::write(dir.join("notas.md"), content)?;
    Ok(())
}

pub fn refresh_document_flags(dir: &Path, meta: &mut TicketMeta) -> bool {
    let mut changed = false;
    changed |= seed_legacy_history(dir, &mut meta.documents.ef, "docs", "EF");
    changed |= seed_legacy_history(dir, &mut meta.documents.et, "docs", "ET");
    changed |= seed_legacy_history(
        dir,
        &mut meta.documents.testes_unitarios,
        "testes",
        "TestesUnitarios",
    );

    sync_document_info(dir, &mut meta.documents.ef);
    sync_document_info(dir, &mut meta.documents.et);
    sync_document_info(dir, &mut meta.documents.testes_unitarios);
    changed
}

/// If an old ticket has a latest .docx but empty history, archive as `_v1` and seed.
fn seed_legacy_history(
    dir: &Path,
    info: &mut crate::domain::models::DocumentInfo,
    dir_rel: &str,
    stem: &str,
) -> bool {
    use crate::domain::models::{DocumentHistoryEntry, DocumentSource};
    use uuid::Uuid;

    if !info.history.is_empty() {
        return false;
    }
    let latest_rel = format!("{dir_rel}/{stem}.docx");
    let latest_abs = dir.join(&latest_rel);
    if !latest_abs.exists() {
        return false;
    }

    let archived_name = format!("{stem}_v1.docx");
    let archived_rel = format!("{dir_rel}/{archived_name}");
    let archived_abs = dir.join(&archived_rel);
    if !archived_abs.exists() {
        if let Err(e) = fs::copy(&latest_abs, &archived_abs) {
            eprintln!("aviso: falha ao arquivar documento legado {latest_rel}: {e}");
            // Fall back to pointing at latest
            let id = Uuid::new_v4().to_string();
            let created = info
                .generated_at
                .clone()
                .unwrap_or_else(crate::domain::models::now_iso);
            info.history.push(DocumentHistoryEntry {
                id: id.clone(),
                file_name: format!("{stem}.docx"),
                path: latest_rel.clone(),
                source: DocumentSource::Generated,
                created_at: created,
                label: None,
            });
            info.active_history_id = Some(id);
            info.exists = true;
            info.path = Some(latest_rel);
            return true;
        }
    }

    let id = Uuid::new_v4().to_string();
    let created = info
        .generated_at
        .clone()
        .unwrap_or_else(crate::domain::models::now_iso);
    info.history.push(DocumentHistoryEntry {
        id: id.clone(),
        file_name: archived_name,
        path: archived_rel.clone(),
        source: DocumentSource::Generated,
        created_at: created,
        label: None,
    });
    info.active_history_id = Some(id);
    info.exists = true;
    info.path = Some(archived_rel);
    true
}

fn sync_document_info(dir: &Path, info: &mut crate::domain::models::DocumentInfo) {
    info.history.retain(|h| dir.join(&h.path).exists());

    if let Some(active) = &info.active_history_id {
        if !info.history.iter().any(|h| &h.id == active) {
            info.active_history_id = info.history.last().map(|h| h.id.clone());
        }
    } else if let Some(last) = info.history.last() {
        info.active_history_id = Some(last.id.clone());
    }

    if let Some(active_id) = &info.active_history_id {
        if let Some(entry) = info.history.iter().find(|h| &h.id == active_id) {
            info.path = Some(entry.path.clone());
            info.generated_at = Some(entry.created_at.clone());
        }
    } else {
        info.path = None;
        info.generated_at = None;
    }

    info.exists = !info.history.is_empty();
}

pub fn load_ticket_detail(root: &Path, client: &str, key: &str) -> AppResult<TicketDetail> {
    let dir = ticket_dir(root, client, key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let meta_path = dir.join("meta.json");
    let orphan = !meta_path.exists();
    let meta = if orphan {
        TicketMeta {
            schema_version: 1,
            key: key.to_string(),
            title: "(órfão — sem meta.json)".into(),
            client: client.to_string(),
            status: TicketStatus::Backlog,
            priority: Default::default(),
            tags: vec![],
            author: String::new(),
            created_at: now_iso(),
            updated_at: now_iso(),
            jira_url: None,
            documents: DocumentsMeta::default(),
            estimativa_horas: None,
        }
    } else {
        let mut m = read_meta(&dir)?;
        if refresh_document_flags(&dir, &mut m) {
            let _ = write_meta(&dir, &m);
        }
        m
    };
    Ok(TicketDetail {
        meta,
        path: dir.to_string_lossy().to_string(),
        notes: read_notes(&dir).unwrap_or_default(),
        checklist: read_checklist(&dir).unwrap_or_else(|_| default_checklist()),
        orphan,
    })
}

pub fn scan_workspace(app: &AppHandle) -> AppResult<WorkspaceTree> {
    let root = require_root(app)?;
    ensure_workspace_marker(&root)?;
    let mut clients = Vec::new();
    let mut tickets = Vec::new();

    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let ft = entry.file_type()?;
        if !ft.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == ".specdriven" {
            continue;
        }
        let client_path = entry.path();
        let mut count = 0usize;

        for t_entry in fs::read_dir(&client_path)? {
            let t_entry = t_entry?;
            if !t_entry.file_type()?.is_dir() {
                continue;
            }
            let key = t_entry.file_name().to_string_lossy().to_string();
            let t_dir = t_entry.path();
            let meta_path = t_dir.join("meta.json");
            let orphan = !meta_path.exists();
            let (title, status, priority, tags, updated_at, documents) = if orphan {
                (
                    "(órfão)".to_string(),
                    TicketStatus::Backlog,
                    Default::default(),
                    vec![],
                    now_iso(),
                    DocumentsMeta::default(),
                )
            } else {
                match read_meta(&t_dir) {
                    Ok(mut m) => {
                        if refresh_document_flags(&t_dir, &mut m) {
                            let _ = write_meta(&t_dir, &m);
                        }
                        (
                            m.title,
                            m.status,
                            m.priority,
                            m.tags,
                            m.updated_at,
                            m.documents,
                        )
                    }
                    Err(_) => (
                        "(meta inválida)".into(),
                        TicketStatus::Backlog,
                        Default::default(),
                        vec![],
                        now_iso(),
                        DocumentsMeta::default(),
                    ),
                }
            };
            tickets.push(TicketSummary {
                key: key.clone(),
                title,
                client: name.clone(),
                status,
                priority,
                tags,
                updated_at,
                documents,
                orphan,
                path: t_dir.to_string_lossy().to_string(),
            });
            count += 1;
        }

        clients.push(ClientSummary {
            name: name.clone(),
            ticket_count: count,
            path: client_path.to_string_lossy().to_string(),
        });
    }

    clients.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    tickets.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(WorkspaceTree {
        root_path: root.to_string_lossy().to_string(),
        clients,
        tickets,
    })
}

pub fn draft_file_name(doc_type: &str) -> AppResult<&'static str> {
    match doc_type {
        "ef" => Ok("ef.json"),
        "et" => Ok("et.json"),
        "testes_unitarios" | "testes-unitarios" | "tu" => Ok("testes-unitarios.json"),
        _ => Err(AppError::validation(format!(
            "Tipo de documento inválido: {doc_type}"
        ))),
    }
}

pub fn normalize_doc_type(doc_type: &str) -> AppResult<&'static str> {
    match doc_type {
        "ef" => Ok("ef"),
        "et" => Ok("et"),
        "testes_unitarios" | "testes-unitarios" | "tu" => Ok("testes_unitarios"),
        _ => Err(AppError::validation(format!(
            "Tipo de documento inválido: {doc_type}"
        ))),
    }
}

pub fn doc_output_rel(doc_type: &str) -> AppResult<&'static str> {
    match normalize_doc_type(doc_type)? {
        "ef" => Ok("docs/EF.docx"),
        "et" => Ok("docs/ET.docx"),
        "testes_unitarios" => Ok("testes/TestesUnitarios.docx"),
        _ => unreachable!(),
    }
}

pub fn doc_output_dir_rel(doc_type: &str) -> AppResult<&'static str> {
    match normalize_doc_type(doc_type)? {
        "ef" | "et" => Ok("docs"),
        "testes_unitarios" => Ok("testes"),
        _ => unreachable!(),
    }
}

pub fn doc_stem(doc_type: &str) -> AppResult<&'static str> {
    match normalize_doc_type(doc_type)? {
        "ef" => Ok("EF"),
        "et" => Ok("ET"),
        "testes_unitarios" => Ok("TestesUnitarios"),
        _ => unreachable!(),
    }
}

pub fn template_file_name(doc_type: &str) -> AppResult<&'static str> {
    match normalize_doc_type(doc_type)? {
        "ef" => Ok("EF.docx"),
        "et" => Ok("ET.docx"),
        "testes_unitarios" => Ok("TestesUnitarios.docx"),
        _ => unreachable!(),
    }
}

pub fn document_info_mut<'a>(
    meta: &'a mut crate::domain::models::TicketMeta,
    doc_type: &str,
) -> AppResult<&'a mut crate::domain::models::DocumentInfo> {
    Ok(match normalize_doc_type(doc_type)? {
        "ef" => &mut meta.documents.ef,
        "et" => &mut meta.documents.et,
        "testes_unitarios" => &mut meta.documents.testes_unitarios,
        _ => unreachable!(),
    })
}

/// Unique dest path under ticket dir; returns relative path using `/`.
pub fn unique_rel_path(dir: &Path, dir_rel: &str, file_name: &str) -> AppResult<(String, PathBuf)> {
    let dest_dir = dir.join(dir_rel);
    fs::create_dir_all(&dest_dir)?;
    let mut dest = dest_dir.join(file_name);
    let mut final_name = file_name.to_string();
    if dest.exists() {
        let stem = dest
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("documento");
        let ext = dest
            .extension()
            .and_then(|s| s.to_str())
            .map(|e| format!(".{e}"))
            .unwrap_or_default();
        let mut i = 1u32;
        loop {
            let candidate_name = format!("{stem}-{i}{ext}");
            let candidate = dest_dir.join(&candidate_name);
            if !candidate.exists() {
                dest = candidate;
                final_name = candidate_name;
                break;
            }
            i = i.saturating_add(1);
        }
    }
    let rel = format!("{dir_rel}/{final_name}");
    Ok((rel, dest))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draft_file_name_maps_doc_types() {
        assert_eq!(draft_file_name("ef").unwrap(), "ef.json");
        assert_eq!(draft_file_name("et").unwrap(), "et.json");
        assert_eq!(
            draft_file_name("testes_unitarios").unwrap(),
            "testes-unitarios.json"
        );
        assert_eq!(
            draft_file_name("testes-unitarios").unwrap(),
            "testes-unitarios.json"
        );
        assert_eq!(draft_file_name("tu").unwrap(), "testes-unitarios.json");
        assert!(draft_file_name("unknown").is_err());
        assert!(draft_file_name("").is_err());
    }

    #[test]
    fn normalize_doc_type_aliases() {
        assert_eq!(normalize_doc_type("ef").unwrap(), "ef");
        assert_eq!(normalize_doc_type("et").unwrap(), "et");
        assert_eq!(
            normalize_doc_type("testes_unitarios").unwrap(),
            "testes_unitarios"
        );
        assert_eq!(
            normalize_doc_type("testes-unitarios").unwrap(),
            "testes_unitarios"
        );
        assert_eq!(normalize_doc_type("tu").unwrap(), "testes_unitarios");
        assert!(normalize_doc_type("xyz").is_err());
    }

    #[test]
    fn doc_output_paths_and_stems() {
        assert_eq!(doc_output_rel("ef").unwrap(), "docs/EF.docx");
        assert_eq!(doc_output_rel("et").unwrap(), "docs/ET.docx");
        assert_eq!(
            doc_output_rel("tu").unwrap(),
            "testes/TestesUnitarios.docx"
        );
        assert_eq!(doc_output_dir_rel("ef").unwrap(), "docs");
        assert_eq!(doc_output_dir_rel("tu").unwrap(), "testes");
        assert_eq!(doc_stem("ef").unwrap(), "EF");
        assert_eq!(doc_stem("et").unwrap(), "ET");
        assert_eq!(doc_stem("tu").unwrap(), "TestesUnitarios");
        assert_eq!(template_file_name("ef").unwrap(), "EF.docx");
        assert_eq!(template_file_name("tu").unwrap(), "TestesUnitarios.docx");
    }
}
