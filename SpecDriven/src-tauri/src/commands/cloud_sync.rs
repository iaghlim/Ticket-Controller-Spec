use crate::domain::cloud_sync::{apply_cloud_pull, CloudPullApplyResult, CloudPullPayload};
use crate::domain::error::AppResult;
use tauri::AppHandle;

#[tauri::command]
pub fn apply_cloud_pull_cmd(
    app: AppHandle,
    payload: CloudPullPayload,
) -> AppResult<CloudPullApplyResult> {
    apply_cloud_pull(&app, payload)
}
