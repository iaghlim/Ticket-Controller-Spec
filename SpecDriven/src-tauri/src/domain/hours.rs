use crate::domain::config::config_path;
use crate::domain::error::{AppError, AppResult};
use crate::domain::timer::{
    ActiveTimer, ClientHoursRow, HoursFile, HoursSummary, TicketHoursRow, TimeEntry, TimeSource,
    WorkspaceHoursReport,
};
use crate::domain::workspace::{read_meta, require_root, ticket_dir, write_json, read_json};
use chrono::Datelike;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn week_bounds() -> (chrono::NaiveDate, chrono::NaiveDate) {
    let now = chrono::Local::now().date_naive();
    let start = now - chrono::Duration::days(now.weekday().num_days_from_monday() as i64);
    let end = start + chrono::Duration::days(6);
    (start, end)
}

fn entry_date(started_at: &str) -> Option<chrono::NaiveDate> {
    chrono::DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Local).date_naive())
}

fn is_today(date: chrono::NaiveDate) -> bool {
    date == chrono::Local::now().date_naive()
}

fn is_this_week(date: chrono::NaiveDate) -> bool {
    let (start, end) = week_bounds();
    date >= start && date <= end
}

fn csv_escape(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn csv_row(
    client: &str,
    key: &str,
    started_at: &str,
    ended_at: &str,
    minutes: f64,
    note: &str,
    source: &str,
) -> String {
    format!(
        "{},{},{},{},{:.2},{},{}\n",
        csv_escape(client),
        csv_escape(key),
        csv_escape(started_at),
        csv_escape(ended_at),
        minutes,
        csv_escape(note),
        csv_escape(source),
    )
}

pub fn hours_path(ticket_dir: &std::path::Path) -> PathBuf {
    ticket_dir.join("horas.json")
}

pub fn read_hours(ticket_dir: &std::path::Path) -> AppResult<HoursFile> {
    let path = hours_path(ticket_dir);
    if !path.exists() {
        return Ok(HoursFile::default());
    }
    read_json(&path)
}

pub fn write_hours(ticket_dir: &std::path::Path, file: &HoursFile) -> AppResult<()> {
    write_json(&hours_path(ticket_dir), file)
}

pub fn append_entry(ticket_dir: &std::path::Path, entry: TimeEntry) -> AppResult<HoursFile> {
    let mut file = read_hours(ticket_dir)?;
    file.entries.push(entry);
    write_hours(ticket_dir, &file)?;
    Ok(file)
}

pub fn summarize(file: &HoursFile) -> HoursSummary {
    let mut total = 0u64;
    let mut today_secs = 0u64;
    let mut week_secs = 0u64;
    for e in &file.entries {
        total += e.seconds;
        if let Some(date) = entry_date(&e.started_at) {
            if is_today(date) {
                today_secs += e.seconds;
            }
            if is_this_week(date) {
                week_secs += e.seconds;
            }
        }
    }
    HoursSummary {
        entries: file.entries.clone(),
        total_seconds: total,
        today_seconds: today_secs,
        week_seconds: week_secs,
    }
}

pub fn read_hours_tolerant(ticket_dir: &Path) -> HoursFile {
    read_hours(ticket_dir).unwrap_or_default()
}

pub fn workspace_hours_report(app: &AppHandle) -> AppResult<WorkspaceHoursReport> {
    let root = require_root(app)?;
    let mut today_seconds = 0u64;
    let mut week_seconds = 0u64;
    let mut by_ticket = Vec::new();
    let mut by_client_map: HashMap<String, ClientHoursRow> = HashMap::new();

    for client_entry in fs::read_dir(&root)? {
        let client_entry = client_entry?;
        if !client_entry.file_type()?.is_dir() {
            continue;
        }
        let client = client_entry.file_name().to_string_lossy().to_string();
        if client.starts_with('.') || client == ".specdriven" {
            continue;
        }

        for ticket_entry in fs::read_dir(client_entry.path())? {
            let ticket_entry = ticket_entry?;
            if !ticket_entry.file_type()?.is_dir() {
                continue;
            }
            let key = ticket_entry.file_name().to_string_lossy().to_string();
            let t_dir = ticket_entry.path();
            let file = read_hours_tolerant(&t_dir);
            if file.entries.is_empty() {
                continue;
            }

            let mut ticket_today = 0u64;
            let mut ticket_week = 0u64;
            for e in &file.entries {
                if let Some(date) = entry_date(&e.started_at) {
                    if is_today(date) {
                        ticket_today += e.seconds;
                    }
                    if is_this_week(date) {
                        ticket_week += e.seconds;
                    }
                }
            }
            if ticket_today == 0 && ticket_week == 0 {
                continue;
            }

            today_seconds += ticket_today;
            week_seconds += ticket_week;

            let title = read_meta(&t_dir)
                .map(|m| m.title)
                .unwrap_or_else(|_| key.clone());

            by_ticket.push(TicketHoursRow {
                client: client.clone(),
                key: key.clone(),
                title,
                today_seconds: ticket_today,
                week_seconds: ticket_week,
            });

            let row = by_client_map.entry(client.clone()).or_insert(ClientHoursRow {
                client: client.clone(),
                today_seconds: 0,
                week_seconds: 0,
            });
            row.today_seconds += ticket_today;
            row.week_seconds += ticket_week;
        }
    }

    by_ticket.sort_by(|a, b| {
        b.week_seconds
            .cmp(&a.week_seconds)
            .then_with(|| a.client.cmp(&b.client))
            .then_with(|| a.key.cmp(&b.key))
    });

    let mut by_client: Vec<ClientHoursRow> = by_client_map.into_values().collect();
    by_client.sort_by(|a, b| {
        b.week_seconds
            .cmp(&a.week_seconds)
            .then_with(|| a.client.cmp(&b.client))
    });

    Ok(WorkspaceHoursReport {
        today_seconds,
        week_seconds,
        by_ticket,
        by_client,
    })
}

pub fn active_timer_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = config_path(app)?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AppError::io_msg("Pasta de config inválida."))?;
    Ok(dir.join("active_timer.json"))
}

pub fn load_persisted_active(app: &AppHandle) -> AppResult<Option<ActiveTimer>> {
    let path = active_timer_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    if raw.trim().is_empty() || raw.trim() == "null" {
        return Ok(None);
    }
    Ok(Some(serde_json::from_str(&raw)?))
}

pub fn save_persisted_active(app: &AppHandle, active: Option<&ActiveTimer>) -> AppResult<()> {
    let path = active_timer_path(app)?;
    match active {
        Some(t) => {
            fs::write(&path, serde_json::to_string_pretty(t)?)?;
        }
        None => {
            if path.exists() {
                fs::remove_file(&path)?;
            }
        }
    }
    Ok(())
}

pub fn ticket_hours_summary(app: &AppHandle, client: &str, key: &str) -> AppResult<HoursSummary> {
    let root = require_root(app)?;
    let dir = ticket_dir(&root, client, key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    Ok(summarize(&read_hours(&dir)?))
}

pub fn add_manual(
    app: &AppHandle,
    client: &str,
    key: &str,
    started_at: &str,
    seconds: u64,
    note: &str,
) -> AppResult<HoursSummary> {
    if seconds == 0 {
        return Err(AppError::validation("A duração deve ser maior que zero."));
    }
    let root = require_root(app)?;
    let dir = ticket_dir(&root, client, key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let ended = chrono::DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(|dt| {
            (dt + chrono::Duration::seconds(seconds as i64)).to_rfc3339()
        });
    let entry = TimeEntry {
        id: crate::domain::timer::new_entry_id(),
        started_at: started_at.to_string(),
        ended_at: ended,
        seconds,
        note: note.to_string(),
        source: TimeSource::Manual,
    };
    let file = append_entry(&dir, entry)?;
    Ok(summarize(&file))
}

pub fn export_csv(app: &AppHandle, client: &str, key: &str, dest_path: &str) -> AppResult<String> {
    let summary = ticket_hours_summary(app, client, key)?;
    let mut csv = String::from("client,key,startedAt,endedAt,minutes,note,source\n");
    for e in &summary.entries {
        let source = match e.source {
            TimeSource::Timer => "timer",
            TimeSource::Manual => "manual",
        };
        csv.push_str(&csv_row(
            client,
            key,
            &e.started_at,
            e.ended_at.as_deref().unwrap_or(""),
            e.seconds as f64 / 60.0,
            &e.note,
            source,
        ));
    }
    fs::write(dest_path, csv)?;
    Ok(dest_path.to_string())
}

pub fn export_week_csv(app: &AppHandle, dest_path: &str) -> AppResult<String> {
    let root = require_root(app)?;
    let mut csv = String::from("client,key,startedAt,endedAt,minutes,note,source\n");

    for client_entry in fs::read_dir(&root)? {
        let client_entry = client_entry?;
        if !client_entry.file_type()?.is_dir() {
            continue;
        }
        let client = client_entry.file_name().to_string_lossy().to_string();
        if client.starts_with('.') || client == ".specdriven" {
            continue;
        }

        for ticket_entry in fs::read_dir(client_entry.path())? {
            let ticket_entry = ticket_entry?;
            if !ticket_entry.file_type()?.is_dir() {
                continue;
            }
            let key = ticket_entry.file_name().to_string_lossy().to_string();
            let file = read_hours_tolerant(&ticket_entry.path());
            for e in &file.entries {
                let Some(date) = entry_date(&e.started_at) else {
                    continue;
                };
                if !is_this_week(date) {
                    continue;
                }
                let source = match e.source {
                    TimeSource::Timer => "timer",
                    TimeSource::Manual => "manual",
                };
                csv.push_str(&csv_row(
                    &client,
                    &key,
                    &e.started_at,
                    e.ended_at.as_deref().unwrap_or(""),
                    e.seconds as f64 / 60.0,
                    &e.note,
                    source,
                ));
            }
        }
    }

    fs::write(dest_path, csv)?;
    Ok(dest_path.to_string())
}
