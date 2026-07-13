//! Materializa payload de `GET /sync/pull` no filesystem local (Fase D).

use crate::domain::error::AppResult;
use crate::domain::hours::{read_hours, write_hours};
use crate::domain::models::{
    default_checklist, DocumentsMeta, Priority, TicketMeta, TicketStatus,
};
use crate::domain::paths::{sanitize_client_name, validate_jira_key};
use crate::domain::timer::{HoursFile, TimeEntry, TimeSource};
use crate::domain::workspace::{
    create_ticket_tree, read_meta, read_notes, require_root, ticket_dir, write_checklist,
    write_meta, write_notes,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullTicketClient {
    pub name: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub code: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullTicketAssignee {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullTicket {
    pub key: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub status: String,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub estimate_minutes: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub client: CloudPullTicketClient,
    #[serde(default)]
    pub assignee: Option<CloudPullTicketAssignee>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullCommentAuthor {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullCommentTicket {
    pub key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullComment {
    pub id: String,
    pub body: String,
    #[serde(default)]
    pub visibility: Option<String>,
    pub created_at: String,
    pub ticket: CloudPullCommentTicket,
    #[serde(default)]
    pub author: Option<CloudPullCommentAuthor>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullTimeEntryTicket {
    pub key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullTimeEntry {
    pub id: String,
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    #[serde(default)]
    pub seconds: Option<i64>,
    #[serde(default)]
    pub note: Option<String>,
    pub ticket: CloudPullTimeEntryTicket,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullPayload {
    #[serde(default)]
    pub tickets: Vec<CloudPullTicket>,
    #[serde(default)]
    pub comments: Vec<CloudPullComment>,
    #[serde(default)]
    pub time_entries: Vec<CloudPullTimeEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudPullApplyResult {
    pub tickets_created: usize,
    pub tickets_updated: usize,
    pub comments_appended: usize,
    pub time_entries_merged: usize,
    pub skipped: Vec<String>,
}

fn parse_status(raw: &str) -> TicketStatus {
    match raw {
        "backlog" => TicketStatus::Backlog,
        "em_andamento" => TicketStatus::EmAndamento,
        "aguardando_cliente" => TicketStatus::AguardandoCliente,
        "em_teste" => TicketStatus::EmTeste,
        "concluido" => TicketStatus::Concluido,
        "cancelado" => TicketStatus::Cancelado,
        _ => TicketStatus::Backlog,
    }
}

fn parse_priority(raw: Option<&str>) -> Priority {
    match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("baixa") => Priority::Baixa,
        Some("alta") => Priority::Alta,
        Some("critica") | Some("crítica") => Priority::Critica,
        Some("media") | Some("média") => Priority::Media,
        _ => Priority::Media,
    }
}

fn assignee_author(assignee: &Option<CloudPullTicketAssignee>) -> String {
    assignee
        .as_ref()
        .and_then(|a| {
            a.name
                .as_ref()
                .filter(|n| !n.trim().is_empty())
                .cloned()
                .or_else(|| a.email.clone())
        })
        .unwrap_or_default()
}

fn find_ticket_dirs(root: &Path) -> AppResult<HashMap<String, (String, PathBuf)>> {
    let mut map = HashMap::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let client = entry.file_name().to_string_lossy().to_string();
        if client.starts_with('.') {
            continue;
        }
        for t_entry in fs::read_dir(entry.path())? {
            let t_entry = t_entry?;
            if !t_entry.file_type()?.is_dir() {
                continue;
            }
            let key = t_entry.file_name().to_string_lossy().to_string();
            map.insert(key, (client.clone(), t_entry.path()));
        }
    }
    Ok(map)
}

fn upsert_ticket(
    root: &Path,
    ticket: &CloudPullTicket,
    index: &mut HashMap<String, (String, PathBuf)>,
) -> AppResult<&'static str> {
    validate_jira_key(&ticket.key)?;
    let client = sanitize_client_name(&ticket.client.name)?;
    let client_path = root.join(&client);
    if !client_path.exists() {
        fs::create_dir_all(&client_path)?;
    }

    let dir = ticket_dir(root, &client, &ticket.key)?;
    let created = !dir.exists();
    if created {
        create_ticket_tree(&dir)?;
    } else {
        create_ticket_tree(&dir)?;
    }

    let author = assignee_author(&ticket.assignee);
    let estimativa = ticket
        .estimate_minutes
        .filter(|m| *m >= 0)
        .map(|m| m as f64 / 60.0);

    let meta = if created || !dir.join("meta.json").exists() {
        if !dir.join("checklist.json").exists() {
            write_checklist(&dir, &default_checklist())?;
        }
        if !dir.join("notas.md").exists() {
            let initial = ticket.description.clone().unwrap_or_default();
            write_notes(&dir, &initial)?;
        }
        TicketMeta {
            schema_version: 1,
            key: ticket.key.clone(),
            title: ticket.title.trim().to_string(),
            client: client.clone(),
            status: parse_status(&ticket.status),
            priority: parse_priority(ticket.priority.as_deref()),
            tags: vec![],
            author,
            created_at: ticket.created_at.clone(),
            updated_at: ticket.updated_at.clone(),
            jira_url: None,
            estimativa_horas: estimativa,
            documents: DocumentsMeta::default(),
        }
    } else {
        let mut meta = read_meta(&dir)?;
        meta.title = ticket.title.trim().to_string();
        meta.client = client.clone();
        meta.status = parse_status(&ticket.status);
        meta.priority = parse_priority(ticket.priority.as_deref());
        if !author.is_empty() {
            meta.author = author;
        }
        meta.updated_at = ticket.updated_at.clone();
        if estimativa.is_some() {
            meta.estimativa_horas = estimativa;
        }
        // Preserve local tags/documents/jira_url/created_at.
        meta
    };

    write_meta(&dir, &meta)?;
    index.insert(ticket.key.clone(), (client, dir));
    Ok(if created { "created" } else { "updated" })
}

fn append_cloud_comment(dir: &Path, comment: &CloudPullComment) -> AppResult<bool> {
    let marker = format!("<!-- cloud-comment:{} -->", comment.id);
    let mut notes = read_notes(dir).unwrap_or_default();
    if notes.contains(&marker) {
        return Ok(false);
    }
    let author = comment
        .author
        .as_ref()
        .and_then(|a| {
            a.name
                .as_ref()
                .filter(|n| !n.trim().is_empty())
                .cloned()
                .or_else(|| a.email.clone())
        })
        .unwrap_or_else(|| "cloud".into());
    let visibility = comment.visibility.as_deref().unwrap_or("public");
    let block = format!(
        "\n\n{marker}\n### Comentário cloud ({visibility}) — {author} · {}\n\n{}\n",
        comment.created_at, comment.body
    );
    if !notes.is_empty() && !notes.ends_with('\n') {
        notes.push('\n');
    }
    notes.push_str(&block);
    write_notes(dir, &notes)?;
    Ok(true)
}

fn merge_time_entry(dir: &Path, entry: &CloudPullTimeEntry) -> AppResult<bool> {
    let mut file = read_hours(dir).unwrap_or_else(|_| HoursFile::default());
    if file.entries.iter().any(|e| e.id == entry.id) {
        return Ok(false);
    }
    let seconds = entry.seconds.unwrap_or(0).max(0) as u64;
    file.entries.push(TimeEntry {
        id: entry.id.clone(),
        started_at: entry.started_at.clone(),
        ended_at: entry.ended_at.clone(),
        seconds,
        note: entry.note.clone().unwrap_or_default(),
        source: TimeSource::Manual,
    });
    write_hours(dir, &file)?;
    Ok(true)
}

pub fn apply_cloud_pull(app: &AppHandle, payload: CloudPullPayload) -> AppResult<CloudPullApplyResult> {
    let root = require_root(app)?;
    let mut index = find_ticket_dirs(&root)?;
    let mut tickets_created = 0usize;
    let mut tickets_updated = 0usize;
    let mut comments_appended = 0usize;
    let mut time_entries_merged = 0usize;
    let mut skipped = Vec::new();

    for ticket in &payload.tickets {
        match upsert_ticket(&root, ticket, &mut index) {
            Ok("created") => tickets_created += 1,
            Ok(_) => tickets_updated += 1,
            Err(e) => skipped.push(format!("ticket {}: {e}", ticket.key)),
        }
    }

    for comment in &payload.comments {
        let Some((_, dir)) = index.get(&comment.ticket.key) else {
            skipped.push(format!(
                "comment {}: ticket {} ausente no disco",
                comment.id, comment.ticket.key
            ));
            continue;
        };
        match append_cloud_comment(dir, comment) {
            Ok(true) => comments_appended += 1,
            Ok(false) => {}
            Err(e) => skipped.push(format!("comment {}: {e}", comment.id)),
        }
    }

    for entry in &payload.time_entries {
        let Some((_, dir)) = index.get(&entry.ticket.key) else {
            skipped.push(format!(
                "timeEntry {}: ticket {} ausente no disco",
                entry.id, entry.ticket.key
            ));
            continue;
        };
        match merge_time_entry(dir, entry) {
            Ok(true) => time_entries_merged += 1,
            Ok(false) => {}
            Err(e) => skipped.push(format!("timeEntry {}: {e}", entry.id)),
        }
    }

    Ok(CloudPullApplyResult {
        tickets_created,
        tickets_updated,
        comments_appended,
        time_entries_merged,
        skipped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_and_priority() {
        assert_eq!(parse_status("em_andamento"), TicketStatus::EmAndamento);
        assert_eq!(parse_priority(Some("alta")), Priority::Alta);
        assert_eq!(parse_priority(None), Priority::Media);
    }
}
