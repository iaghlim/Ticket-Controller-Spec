use crate::domain::hours::{export_week_csv, workspace_hours_report};
use crate::domain::timer::WorkspaceHoursReport;
use tauri::AppHandle;

#[tauri::command]
pub fn get_workspace_hours_report(app: AppHandle) -> crate::domain::error::AppResult<WorkspaceHoursReport> {
    workspace_hours_report(&app)
}

#[tauri::command]
pub fn export_week_hours_csv(
    app: AppHandle,
    dest_path: String,
) -> crate::domain::error::AppResult<serde_json::Value> {
    let path = export_week_csv(&app, &dest_path)?;
    Ok(serde_json::json!({ "path": path }))
}
