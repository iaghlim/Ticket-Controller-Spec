use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

use crate::domain::models::now_iso;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimeSource {
    Timer,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimerStatus {
    Running,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: String,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub seconds: u64,
    #[serde(default)]
    pub note: String,
    pub source: TimeSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoursFile {
    pub schema_version: u32,
    pub entries: Vec<TimeEntry>,
}

impl Default for HoursFile {
    fn default() -> Self {
        Self {
            schema_version: 1,
            entries: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTimer {
    pub client: String,
    pub key: String,
    pub title: String,
    pub entry_id: String,
    /// When the overall session first started (first Play).
    pub session_started_at: String,
    /// When the current running segment started (None if paused).
    pub segment_started_at: Option<String>,
    /// Seconds accumulated from completed (paused) segments.
    pub accumulated_secs: u64,
    pub status: TimerStatus,
    #[serde(default)]
    pub note: String,
}

impl ActiveTimer {
    pub fn elapsed_secs_now(&self) -> u64 {
        let mut total = self.accumulated_secs;
        if self.status == TimerStatus::Running {
            if let Some(ref start) = self.segment_started_at {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(start) {
                    let now = chrono::Local::now();
                    let elapsed = now.signed_duration_since(dt.with_timezone(&chrono::Local));
                    total += elapsed.num_seconds().max(0) as u64;
                }
            }
        }
        total
    }

    pub fn freeze_segment(&mut self) {
        if self.status == TimerStatus::Running {
            if let Some(ref start) = self.segment_started_at {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(start) {
                    let now = chrono::Local::now();
                    let elapsed = now.signed_duration_since(dt.with_timezone(&chrono::Local));
                    self.accumulated_secs += elapsed.num_seconds().max(0) as u64;
                }
            }
            self.segment_started_at = None;
            self.status = TimerStatus::Paused;
        }
    }

    pub fn resume_segment(&mut self) {
        self.segment_started_at = Some(now_iso());
        self.status = TimerStatus::Running;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTimerView {
    pub client: String,
    pub key: String,
    pub title: String,
    pub entry_id: String,
    pub session_started_at: String,
    pub status: TimerStatus,
    pub elapsed_secs: u64,
    pub note: String,
}

impl From<&ActiveTimer> for ActiveTimerView {
    fn from(t: &ActiveTimer) -> Self {
        Self {
            client: t.client.clone(),
            key: t.key.clone(),
            title: t.title.clone(),
            entry_id: t.entry_id.clone(),
            session_started_at: t.session_started_at.clone(),
            status: t.status.clone(),
            elapsed_secs: t.elapsed_secs_now(),
            note: t.note.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoursSummary {
    pub entries: Vec<TimeEntry>,
    pub total_seconds: u64,
    pub today_seconds: u64,
    pub week_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientHoursRow {
    pub client: String,
    pub today_seconds: u64,
    pub week_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketHoursRow {
    pub client: String,
    pub key: String,
    pub title: String,
    pub today_seconds: u64,
    pub week_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHoursReport {
    pub today_seconds: u64,
    pub week_seconds: u64,
    pub by_ticket: Vec<TicketHoursRow>,
    pub by_client: Vec<ClientHoursRow>,
}

#[derive(Debug, Default)]
pub struct TimerState {
    pub active: Option<ActiveTimer>,
}

pub type SharedTimer = Mutex<TimerState>;

pub fn new_entry_id() -> String {
    Uuid::new_v4().to_string()
}
