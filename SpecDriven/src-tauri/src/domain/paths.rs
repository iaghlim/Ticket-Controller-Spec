use crate::domain::error::{AppError, AppResult};
use regex::Regex;
use std::sync::OnceLock;

pub fn is_valid_jira_key(key: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^[A-Z][A-Z0-9]+-\d+$").expect("regex"));
    re.is_match(key)
}

pub fn validate_jira_key(key: &str) -> AppResult<()> {
    if is_valid_jira_key(key) {
        Ok(())
    } else {
        Err(AppError::invalid_key(key))
    }
}

pub fn sanitize_client_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_client(name));
    }
    if trimmed == ".specdriven" {
        return Err(AppError::invalid_client(name));
    }
    let invalid = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if trimmed.chars().any(|c| invalid.contains(&c)) {
        return Err(AppError::invalid_client(name));
    }
    Ok(trimmed.to_string())
}

pub fn sanitize_file_name(name: &str) -> AppResult<String> {
    let base = std::path::Path::new(name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .trim();
    if base.is_empty() || base == "." || base == ".." {
        return Err(AppError::validation("Nome de arquivo inválido."));
    }
    let invalid = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    if base.chars().any(|c| invalid.contains(&c)) {
        return Err(AppError::validation(format!(
            "Nome de arquivo inválido: {base}"
        )));
    }
    Ok(base.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_jira_keys() {
        for key in ["PROJ-123", "ABC-1", "A1-9", "TEAM2-42", "XY-99999"] {
            assert!(is_valid_jira_key(key), "expected valid: {key}");
            assert!(validate_jira_key(key).is_ok(), "expected Ok: {key}");
        }
    }

    #[test]
    fn invalid_jira_keys() {
        for key in [
            "",
            "proj-123",
            "PROJ",
            "PROJ-",
            "-123",
            "PROJ-0a",
            "P-123",
            "PRO J-1",
            "PROJ_123",
            "1PROJ-1",
            "PROJ-123 ",
            " PROJ-123",
        ] {
            assert!(!is_valid_jira_key(key), "expected invalid: {key:?}");
            assert!(validate_jira_key(key).is_err(), "expected Err: {key:?}");
        }
    }

    #[test]
    fn sanitize_client_name_ok() {
        assert_eq!(sanitize_client_name("  Acme  ").unwrap(), "Acme");
        assert_eq!(sanitize_client_name("Cliente-A").unwrap(), "Cliente-A");
    }

    #[test]
    fn sanitize_client_name_rejects() {
        assert!(sanitize_client_name("").is_err());
        assert!(sanitize_client_name("   ").is_err());
        assert!(sanitize_client_name(".specdriven").is_err());
        assert!(sanitize_client_name("a/b").is_err());
        assert!(sanitize_client_name("a:b").is_err());
    }

    #[test]
    fn sanitize_file_name_ok() {
        assert_eq!(sanitize_file_name("relatorio.docx").unwrap(), "relatorio.docx");
        assert_eq!(sanitize_file_name("  nota.txt  ").unwrap(), "nota.txt");
    }

    #[test]
    fn sanitize_file_name_rejects() {
        assert!(sanitize_file_name("").is_err());
        assert!(sanitize_file_name(".").is_err());
        assert!(sanitize_file_name("..").is_err());
        assert!(sanitize_file_name("a*b.txt").is_err());
        assert!(sanitize_file_name("file?.txt").is_err());
        assert!(sanitize_file_name("a|b.txt").is_err());
    }

    #[test]
    fn sanitize_file_name_uses_basename() {
        // Path separators are stripped via Path::file_name before validation.
        assert_eq!(sanitize_file_name("a/b.txt").unwrap(), "b.txt");
    }
}
