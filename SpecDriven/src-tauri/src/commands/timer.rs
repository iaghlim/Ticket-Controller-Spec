use crate::domain::error::{AppError, AppResult};
use crate::domain::hours::{
    add_manual, append_entry, export_csv, load_persisted_active, read_hours, save_persisted_active,
    summarize, ticket_hours_summary,
};
use crate::domain::models::now_iso;
use crate::domain::timer::{
    new_entry_id, ActiveTimer, ActiveTimerView, HoursSummary, SharedTimer, TimeEntry, TimeSource,
    TimerStatus, TimerState,
};
use crate::domain::workspace::{require_root, ticket_dir};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

fn sync_persist(app: &AppHandle, state: &SharedTimer) -> AppResult<()> {
    let guard = state.lock().map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;
    save_persisted_active(app, guard.active.as_ref())
}

fn view_from_state(state: &SharedTimer) -> AppResult<Option<ActiveTimerView>> {
    let guard = state.lock().map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;
    Ok(guard.active.as_ref().map(ActiveTimerView::from))
}

fn finalize_active(app: &AppHandle, active: &ActiveTimer, note: Option<String>) -> AppResult<()> {
    let mut a = active.clone();
    a.freeze_segment();
    let secs = a.accumulated_secs;
    if secs == 0 {
        // nothing to save
        return Ok(());
    }
    let root = require_root(app)?;
    let dir = ticket_dir(&root, &a.client, &a.key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{}/{}", a.client, a.key)));
    }
    let entry = TimeEntry {
        id: a.entry_id.clone(),
        started_at: a.session_started_at.clone(),
        ended_at: Some(now_iso()),
        seconds: secs,
        note: note.unwrap_or(a.note),
        source: TimeSource::Timer,
    };
    append_entry(&dir, entry)?;
    Ok(())
}

#[tauri::command]
pub fn get_active_timer(state: State<'_, SharedTimer>) -> AppResult<Option<ActiveTimerView>> {
    view_from_state(&state)
}

#[tauri::command]
pub fn start_timer(
    app: AppHandle,
    state: State<'_, SharedTimer>,
    client: String,
    key: String,
    title: Option<String>,
    switch_confirmed: Option<bool>,
) -> AppResult<ActiveTimerView> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    if !dir.exists() {
        return Err(AppError::not_found(&format!("{client}/{key}")));
    }
    let title = title.unwrap_or_else(|| {
        crate::domain::workspace::read_meta(&dir)
            .map(|m| m.title)
            .unwrap_or_else(|_| key.clone())
    });

    {
        let mut guard = state
            .lock()
            .map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;

        if let Some(ref mut active) = guard.active {
            let same = active.client == client && active.key == key;
            if same {
                if active.status == TimerStatus::Paused {
                    active.resume_segment();
                }
                // already running on same ticket — no-op
                let view = ActiveTimerView::from(&*active);
                drop(guard);
                sync_persist(&app, &state)?;
                return Ok(view);
            }

            // Different ticket
            if active.status == TimerStatus::Running || active.accumulated_secs > 0 || active.segment_started_at.is_some() {
                if !switch_confirmed.unwrap_or(false) {
                    return Err(AppError::conflict(format!(
                        "Já existe um timer em {}/{} ({}). Confirme para finalizar e iniciar neste chamado.",
                        active.client,
                        active.key,
                        active.title
                    )));
                }
                let prev = active.clone();
                guard.active = None;
                drop(guard);
                finalize_active(&app, &prev, None)?;
                // re-lock
                let mut guard = state
                    .lock()
                    .map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;
                let now = now_iso();
                let timer = ActiveTimer {
                    client: client.clone(),
                    key: key.clone(),
                    title: title.clone(),
                    entry_id: new_entry_id(),
                    session_started_at: now.clone(),
                    segment_started_at: Some(now),
                    accumulated_secs: 0,
                    status: TimerStatus::Running,
                    note: String::new(),
                };
                let view = ActiveTimerView::from(&timer);
                guard.active = Some(timer);
                drop(guard);
                sync_persist(&app, &state)?;
                return Ok(view);
            }
        }

        let now = now_iso();
        let timer = ActiveTimer {
            client,
            key,
            title,
            entry_id: new_entry_id(),
            session_started_at: now.clone(),
            segment_started_at: Some(now),
            accumulated_secs: 0,
            status: TimerStatus::Running,
            note: String::new(),
        };
        guard.active = Some(timer);
    }
    sync_persist(&app, &state)?;
    view_from_state(&state)?.ok_or_else(|| AppError::io_msg("Falha ao iniciar timer."))
}

#[tauri::command]
pub fn pause_timer(app: AppHandle, state: State<'_, SharedTimer>) -> AppResult<ActiveTimerView> {
    {
        let mut guard = state
            .lock()
            .map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;
        let active = guard
            .active
            .as_mut()
            .ok_or_else(|| AppError::validation("Nenhum timer ativo."))?;
        active.freeze_segment();
    }
    sync_persist(&app, &state)?;
    view_from_state(&state)?.ok_or_else(|| AppError::validation("Nenhum timer ativo."))
}

#[tauri::command]
pub fn stop_timer(
    app: AppHandle,
    state: State<'_, SharedTimer>,
    note: Option<String>,
) -> AppResult<HoursSummary> {
    let active = {
        let mut guard = state
            .lock()
            .map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;
        guard.active.take()
    };
    let Some(active) = active else {
        return Err(AppError::validation("Nenhum timer ativo."));
    };
    let client = active.client.clone();
    let key = active.key.clone();
    finalize_active(&app, &active, note)?;
    sync_persist(&app, &state)?;
    ticket_hours_summary(&app, &client, &key)
}

#[tauri::command]
pub fn set_timer_note(
    app: AppHandle,
    state: State<'_, SharedTimer>,
    note: String,
) -> AppResult<ActiveTimerView> {
    {
        let mut guard = state
            .lock()
            .map_err(|_| AppError::io_msg("Estado do timer bloqueado."))?;
        let active = guard
            .active
            .as_mut()
            .ok_or_else(|| AppError::validation("Nenhum timer ativo."))?;
        active.note = note;
    }
    sync_persist(&app, &state)?;
    view_from_state(&state)?.ok_or_else(|| AppError::validation("Nenhum timer ativo."))
}

#[tauri::command]
pub fn list_hours(app: AppHandle, client: String, key: String) -> AppResult<HoursSummary> {
    ticket_hours_summary(&app, &client, &key)
}

#[tauri::command]
pub fn add_manual_entry(
    app: AppHandle,
    client: String,
    key: String,
    started_at: String,
    seconds: u64,
    note: Option<String>,
) -> AppResult<HoursSummary> {
    add_manual(
        &app,
        &client,
        &key,
        &started_at,
        seconds,
        note.as_deref().unwrap_or(""),
    )
}

#[tauri::command]
pub fn delete_hours_entry(
    app: AppHandle,
    client: String,
    key: String,
    entry_id: String,
) -> AppResult<HoursSummary> {
    let root = require_root(&app)?;
    let dir = ticket_dir(&root, &client, &key)?;
    let mut file = read_hours(&dir)?;
    let before = file.entries.len();
    file.entries.retain(|e| e.id != entry_id);
    if file.entries.len() == before {
        return Err(AppError::not_found(&entry_id));
    }
    crate::domain::hours::write_hours(&dir, &file)?;
    Ok(summarize(&file))
}

#[tauri::command]
pub fn export_hours_csv(
    app: AppHandle,
    client: String,
    key: String,
    dest_path: String,
) -> AppResult<serde_json::Value> {
    let path = export_csv(&app, &client, &key, &dest_path)?;
    Ok(serde_json::json!({ "path": path }))
}

/// Must be `async` on Windows: creating a WebviewWindow inside a sync command
/// deadlocks WebView2 and leaves a blank white frozen window.
#[tauri::command]
pub async fn show_timer_overlay(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("timer-overlay") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }

    // Query param is a reliable fallback for React to pick overlay mode
    // if window label is not yet readable when the bundle boots.
    let builder = WebviewWindowBuilder::new(
        &app,
        "timer-overlay",
        WebviewUrl::App("index.html?window=timer-overlay".into()),
    )
    .title("SpecDriven Timer")
    .inner_size(320.0, 140.0)
    .min_inner_size(280.0, 120.0)
    .resizable(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(false)
    .visible(true)
    .focused(true);

    builder
        .build()
        .map_err(|e| AppError::io_msg(format!("Não foi possível abrir o overlay: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        Ok(())
    } else {
        Err(AppError::not_found("janela principal"))
    }
}

#[tauri::command]
pub fn close_timer_overlay(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("timer-overlay") {
        let _ = w.hide(); // hide, don't destroy — state stays in Rust
    }
    Ok(())
}

#[tauri::command]
pub fn set_timer_overlay_compact(app: AppHandle, compact: bool) -> AppResult<()> {
    let Some(w) = app.get_webview_window("timer-overlay") else {
        return Ok(());
    };
    if compact {
        let _ = w.set_min_size(Some(tauri::LogicalSize::new(240.0, 40.0)));
        let _ = w.set_size(tauri::LogicalSize::new(320.0, 48.0));
    } else {
        let _ = w.set_min_size(Some(tauri::LogicalSize::new(280.0, 120.0)));
        let _ = w.set_size(tauri::LogicalSize::new(320.0, 140.0));
    }
    Ok(())
}

pub fn init_timer_state(app: &AppHandle) -> SharedTimer {
    let active = load_persisted_active(app).ok().flatten();
    Mutex::new(TimerState { active })
}
