use crate::domain::error::{AppError, AppResult};
use crate::domain::workspace::{read_json, require_root, write_json};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnippetsPayload {
    pub schema_version: u32,
    pub snippets: Vec<Snippet>,
}

impl Default for SnippetsPayload {
    fn default() -> Self {
        Self {
            schema_version: 1,
            snippets: default_snippets(),
        }
    }
}

fn snippets_path(app: &AppHandle) -> AppResult<PathBuf> {
    let root = require_root(app)?;
    Ok(root.join(".specdriven").join("snippets.json"))
}

fn default_snippets() -> Vec<Snippet> {
    vec![
        Snippet {
            id: Uuid::new_v4().to_string(),
            title: "Critérios de aceite".into(),
            body: "Dado que [contexto]\nQuando [ação]\nEntão [resultado esperado]\n\n- [ ] Cenário 1 validado\n- [ ] Cenário 2 validado".into(),
        },
        Snippet {
            id: Uuid::new_v4().to_string(),
            title: "Fora de escopo".into(),
            body: "- Integrações não previstas nesta entrega\n- Alterações em módulos legados fora do escopo acordado\n- Treinamento e documentação operacional".into(),
        },
        Snippet {
            id: Uuid::new_v4().to_string(),
            title: "Riscos técnicos".into(),
            body: "| Risco | Impacto | Mitigação |\n|-------|---------|----------|\n| [descrever] | Alto/Médio/Baixo | [ação] |".into(),
        },
    ]
}

fn load_or_init(app: &AppHandle) -> AppResult<SnippetsPayload> {
    let path = snippets_path(app)?;
    if !path.exists() {
        let payload = SnippetsPayload::default();
        write_json(&path, &payload)?;
        return Ok(payload);
    }
    read_json(&path)
}

#[tauri::command]
pub fn get_snippets(app: AppHandle) -> AppResult<SnippetsPayload> {
    load_or_init(&app)
}

#[tauri::command]
pub fn save_snippets(app: AppHandle, snippets: Vec<Snippet>) -> AppResult<SnippetsPayload> {
    for s in &snippets {
        if s.title.trim().is_empty() {
            return Err(AppError::validation("Título do snippet não pode ser vazio."));
        }
    }
    let payload = SnippetsPayload {
        schema_version: 1,
        snippets,
    };
    write_json(&snippets_path(&app)?, &payload)?;
    Ok(payload)
}
