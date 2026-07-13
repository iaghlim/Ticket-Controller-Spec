use crate::domain::error::AppResult;
use crate::domain::models::SearchHit;
use crate::domain::workspace::scan_workspace;
use tauri::AppHandle;

#[tauri::command]
pub fn search(app: AppHandle, query: String) -> AppResult<Vec<SearchHit>> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let tree = scan_workspace(&app)?;
    let mut hits = Vec::new();
    for t in tree.tickets {
        let mut hints = Vec::new();
        if t.key.to_lowercase().contains(&q) {
            hints.push("chave");
        }
        if t.title.to_lowercase().contains(&q) {
            hints.push("título");
        }
        if t.client.to_lowercase().contains(&q) {
            hints.push("cliente");
        }
        if t.status.as_str().contains(&q) || format!("{:?}", t.status).to_lowercase().contains(&q)
        {
            hints.push("status");
        }
        if t.tags.iter().any(|tag| tag.to_lowercase().contains(&q)) {
            hints.push("tag");
        }
        if !hints.is_empty() {
            hits.push(SearchHit {
                client: t.client,
                key: t.key,
                title: t.title,
                status: t.status,
                tags: t.tags,
                score_hint: hints.join(", "),
            });
        }
    }
    Ok(hits)
}
