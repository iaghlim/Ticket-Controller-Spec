use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_theme() -> String {
    "system".into()
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudConfig {
    #[serde(default = "default_cloud_mode")]
    pub mode: String,
    #[serde(default = "default_cloud_api_url")]
    pub api_url: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub last_sync_at: Option<String>,
}

fn default_cloud_mode() -> String {
    "local".into()
}

fn default_cloud_api_url() -> String {
    "http://127.0.0.1:3000".into()
}

impl Default for CloudConfig {
    fn default() -> Self {
        Self {
            mode: default_cloud_mode(),
            api_url: default_cloud_api_url(),
            token: None,
            email: None,
            last_sync_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default)]
    pub root_path: Option<String>,
    #[serde(default)]
    pub author_default: String,
    #[serde(default)]
    pub recent_roots: Vec<String>,
    #[serde(default)]
    pub ui: UiConfig,
    #[serde(default = "default_empty_placeholder")]
    pub empty_placeholder: String,
    #[serde(default)]
    pub cloud: CloudConfig,
}

fn default_empty_placeholder() -> String {
    "—".into()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            root_path: None,
            author_default: String::new(),
            recent_roots: vec![],
            ui: UiConfig::default(),
            empty_placeholder: default_empty_placeholder(),
            cloud: CloudConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMeta {
    pub schema_version: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TicketStatus {
    Backlog,
    EmAndamento,
    AguardandoCliente,
    EmTeste,
    Concluido,
    Cancelado,
}

impl Default for TicketStatus {
    fn default() -> Self {
        Self::Backlog
    }
}

impl TicketStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::EmAndamento => "em_andamento",
            Self::AguardandoCliente => "aguardando_cliente",
            Self::EmTeste => "em_teste",
            Self::Concluido => "concluido",
            Self::Cancelado => "cancelado",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Baixa,
    Media,
    Alta,
    Critica,
}

impl Default for Priority {
    fn default() -> Self {
        Self::Media
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DocumentSource {
    Generated,
    Attached,
}

impl Default for DocumentSource {
    fn default() -> Self {
        Self::Generated
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentHistoryEntry {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub source: DocumentSource,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInfo {
    #[serde(default)]
    pub exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft_version: Option<u32>,
    #[serde(default)]
    pub history: Vec<DocumentHistoryEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_history_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentsMeta {
    #[serde(default)]
    pub ef: DocumentInfo,
    #[serde(default)]
    pub et: DocumentInfo,
    #[serde(default)]
    pub testes_unitarios: DocumentInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketMeta {
    pub schema_version: u32,
    pub key: String,
    pub title: String,
    pub client: String,
    pub status: TicketStatus,
    pub priority: Priority,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jira_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimativa_horas: Option<f64>,
    #[serde(default)]
    pub documents: DocumentsMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: String,
    pub label: String,
    pub done: bool,
    #[serde(default)]
    pub custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checklist {
    pub schema_version: u32,
    pub items: Vec<ChecklistItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientSummary {
    pub name: String,
    pub ticket_count: usize,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketSummary {
    pub key: String,
    pub title: String,
    pub client: String,
    pub status: TicketStatus,
    pub priority: Priority,
    pub tags: Vec<String>,
    pub updated_at: String,
    pub documents: DocumentsMeta,
    pub orphan: bool,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TicketDetail {
    pub meta: TicketMeta,
    pub path: String,
    pub notes: String,
    pub checklist: Checklist,
    pub orphan: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTree {
    pub root_path: String,
    pub clients: Vec<ClientSummary>,
    pub tickets: Vec<TicketSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub file_name: String,
    pub path: String,
    pub size: u64,
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub client: String,
    pub key: String,
    pub title: String,
    pub status: TicketStatus,
    pub tags: Vec<String>,
    pub score_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub path: String,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPayload {
    pub doc_type: String,
    pub version: u32,
    pub data: HashMap<String, Value>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPrint {
    pub id: String,
    pub file_name: String,
    #[serde(default)]
    pub caption: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPrintsPayload {
    pub schema_version: u32,
    pub prints: Vec<DraftPrint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTicketInput {
    pub client: String,
    pub key: String,
    pub title: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub jira_url: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub status: Option<TicketStatus>,
    #[serde(default)]
    pub estimativa_horas: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTicketPatch {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub status: Option<TicketStatus>,
    #[serde(default)]
    pub priority: Option<Priority>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub jira_url: Option<Option<String>>,
    #[serde(default)]
    pub estimativa_horas: Option<Option<f64>>,
}

pub fn default_checklist() -> Checklist {
    let labels = [
        "Entendimento validado com cliente",
        "EF gerada",
        "ET gerada",
        "Testes unitários documentados",
        "Evidências anexadas",
        "Deploy / entrega",
        "Chamado atualizado no Jira",
    ];
    Checklist {
        schema_version: 1,
        items: labels
            .iter()
            .enumerate()
            .map(|(i, label)| ChecklistItem {
                id: format!("default-{}", i + 1),
                label: (*label).to_string(),
                done: false,
                custom: false,
            })
            .collect(),
    }
}

pub fn now_iso() -> String {
    chrono::Local::now().to_rfc3339()
}
