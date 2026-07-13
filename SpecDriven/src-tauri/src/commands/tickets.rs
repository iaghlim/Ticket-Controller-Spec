use crate::domain::config::load_config;
use crate::domain::error::{AppError, AppResult};
use crate::domain::models::{
    default_checklist, now_iso, CreateTicketInput, DocumentsMeta, Priority, TicketDetail,
    TicketMeta, TicketStatus, UpdateTicketPatch,
};
use crate::domain::paths::{sanitize_client_name, validate_jira_key};
use crate::domain::workspace::{
    create_ticket_tree, load_ticket_detail, read_meta, require_root, ticket_dir, write_checklist,
    write_meta, write_notes,
};
use std::fs;
use tauri::AppHandle;

#[tauri::command]
pub fn create_ticket(app: AppHandle, input: CreateTicketInput) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    let client = sanitize_client_name(&input.client)?;
    validate_jira_key(&input.key)?;
    if input.title.trim().is_empty() {
        return Err(AppError::validation("O título do chamado é obrigatório."));
    }

    let client_path = root.join(&client);
    if !client_path.exists() {
        fs::create_dir_all(&client_path)?;
    }

    let dir = ticket_dir(&root, &client, &input.key)?;
    if dir.exists() {
        return Err(AppError::already_exists(&format!("{client}/{}", input.key)));
    }

    create_ticket_tree(&dir)?;
    let cfg = load_config(&app)?;
    let author = input
        .author
        .filter(|a| !a.trim().is_empty())
        .unwrap_or(cfg.author_default);
    let now = now_iso();
    let meta = TicketMeta {
        schema_version: 1,
        key: input.key.clone(),
        title: input.title.trim().to_string(),
        client: client.clone(),
        status: input.status.unwrap_or(TicketStatus::Backlog),
        priority: input.priority.unwrap_or(Priority::Media),
        tags: input.tags.unwrap_or_default(),
        author,
        created_at: now.clone(),
        updated_at: now,
        jira_url: input.jira_url.filter(|u| !u.trim().is_empty()),
        estimativa_horas: input.estimativa_horas.filter(|h| *h >= 0.0),
        documents: DocumentsMeta::default(),
    };
    write_meta(&dir, &meta)?;
    write_checklist(&dir, &default_checklist())?;
    write_notes(&dir, "")?;

    load_ticket_detail(&root, &client, &input.key)
}

#[tauri::command]
pub fn get_ticket(app: AppHandle, client: String, key: String) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    load_ticket_detail(&root, &client, &key)
}

#[tauri::command]
pub fn update_ticket_meta(
    app: AppHandle,
    client: String,
    key: String,
    patch: UpdateTicketPatch,
) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let mut meta = read_meta(&dir)?;
    if let Some(title) = patch.title {
        if title.trim().is_empty() {
            return Err(AppError::validation("Título não pode ser vazio."));
        }
        meta.title = title.trim().to_string();
    }
    if let Some(status) = patch.status {
        meta.status = status;
    }
    if let Some(priority) = patch.priority {
        meta.priority = priority;
    }
    if let Some(tags) = patch.tags {
        meta.tags = tags;
    }
    if let Some(author) = patch.author {
        meta.author = author;
    }
    if let Some(jira) = patch.jira_url {
        meta.jira_url = jira.filter(|u| !u.trim().is_empty());
    }
    if let Some(est) = patch.estimativa_horas {
        if let Some(h) = est {
            if h < 0.0 {
                return Err(AppError::validation(
                    "Estimativa de horas não pode ser negativa.",
                ));
            }
        }
        meta.estimativa_horas = est;
    }
    meta.updated_at = now_iso();
    write_meta(&dir, &meta)?;
    load_ticket_detail(&root, &client, &key)
}

#[tauri::command]
pub fn delete_ticket(
    app: AppHandle,
    client: String,
    key: String,
    confirm: bool,
) -> AppResult<()> {
    if !confirm {
        return Err(AppError::validation(
            "Exclusão não confirmada. Marque a confirmação para excluir o chamado.",
        ));
    }
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    fs::remove_dir_all(dir)?;
    Ok(())
}

#[tauri::command]
pub fn repair_ticket_meta(
    app: AppHandle,
    client: String,
    key: String,
    title: Option<String>,
) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    create_ticket_tree(&dir)?;
    let cfg = load_config(&app)?;
    let now = now_iso();
    let meta = TicketMeta {
        schema_version: 1,
        key: key.clone(),
        title: title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| key.clone()),
        client: client.clone(),
        status: TicketStatus::Backlog,
        priority: Priority::Media,
        tags: vec![],
        author: cfg.author_default,
        created_at: now.clone(),
        updated_at: now,
        jira_url: None,
        documents: DocumentsMeta::default(),
        estimativa_horas: None,
    };
    write_meta(&dir, &meta)?;
    if !dir.join("checklist.json").exists() {
        write_checklist(&dir, &default_checklist())?;
    }
    if !dir.join("notas.md").exists() {
        write_notes(&dir, "")?;
    }
    load_ticket_detail(&root, &client, &key)
}

#[tauri::command]
pub fn duplicate_ticket(
    app: AppHandle,
    client: String,
    key: String,
    new_key: String,
    include_attachments: Option<bool>,
) -> AppResult<TicketDetail> {
    let root = require_root(&app)?;
    validate_jira_key(&new_key)?;
    let src = ticket_dir(&root, &client, &key)?;
    if !src.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let dest = ticket_dir(&root, &client, &new_key)?;
    if dest.exists() {
        return Err(AppError::already_exists(&format!("{client}/{new_key}")));
    }

    create_ticket_tree(&dest)?;
    let mut meta = read_meta(&src)?;
    meta.key = new_key.clone();
    meta.created_at = now_iso();
    meta.updated_at = now_iso();
    meta.documents = DocumentsMeta::default();
    write_meta(&dest, &meta)?;

    // checklist + notes
    let checklist = crate::domain::workspace::read_checklist(&src)
        .unwrap_or_else(|_| default_checklist());
    write_checklist(&dest, &checklist)?;
    let notes = crate::domain::workspace::read_notes(&src).unwrap_or_default();
    write_notes(&dest, &notes)?;

    // drafts only (not docs)
    let drafts_src = src.join("drafts");
    let drafts_dest = dest.join("drafts");
    if drafts_src.exists() {
        for entry in fs::read_dir(drafts_src)?.flatten() {
            if entry.file_type()?.is_file() {
                let name = entry.file_name();
                fs::copy(entry.path(), drafts_dest.join(&name))?;
            }
        }
    }

    if include_attachments.unwrap_or(false) {
        let anexos_src = src.join("anexos");
        let anexos_dest = dest.join("anexos");
        if anexos_src.exists() {
            for entry in fs::read_dir(anexos_src)?.flatten() {
                if entry.file_type()?.is_file() {
                    fs::copy(entry.path(), anexos_dest.join(entry.file_name()))?;
                }
            }
        }
    }

    load_ticket_detail(&root, &client, &new_key)
}
