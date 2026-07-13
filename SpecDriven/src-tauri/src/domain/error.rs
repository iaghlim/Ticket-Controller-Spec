use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{message}")]
    Coded { code: &'static str, message: String },
    #[error("Erro de E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("Erro de JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Erro de ZIP: {0}")]
    Zip(#[from] zip::result::ZipError),
}

impl AppError {
    pub fn coded(code: &'static str, message: impl Into<String>) -> Self {
        Self::Coded {
            code,
            message: message.into(),
        }
    }

    pub fn root_not_set() -> Self {
        Self::coded(
            "ROOT_NOT_SET",
            "Pasta raiz não configurada. Escolha uma pasta de trabalho nas configurações.",
        )
    }

    pub fn invalid_key(key: &str) -> Self {
        Self::coded(
            "INVALID_KEY",
            format!(
                "Chave Jira inválida: '{key}'. Use o formato PROJ-123 (letras/números + hífen + dígitos)."
            ),
        )
    }

    pub fn invalid_client(name: &str) -> Self {
        Self::coded(
            "INVALID_CLIENT",
            format!(
                "Nome de cliente inválido: '{name}'. Não use \\ / : * ? \" < > |"
            ),
        )
    }

    pub fn already_exists(what: &str) -> Self {
        Self::coded("ALREADY_EXISTS", format!("Já existe: {what}"))
    }

    pub fn not_found(what: &str) -> Self {
        Self::coded("NOT_FOUND", format!("Não encontrado: {what}"))
    }

    pub fn io_msg(msg: impl Into<String>) -> Self {
        Self::coded("IO_ERROR", msg)
    }

    pub fn template(msg: impl Into<String>) -> Self {
        Self::coded("TEMPLATE_ERROR", msg)
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self::coded("VALIDATION_ERROR", msg)
    }

    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::coded("CONFLICT", msg)
    }
}

#[derive(Debug, Serialize)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let (code, message) = match self {
            AppError::Coded { code, message } => ((*code).to_string(), message.clone()),
            AppError::Io(e) => ("IO_ERROR".to_string(), format!("Erro de E/S: {e}")),
            AppError::Json(e) => ("JSON_ERROR".to_string(), format!("Erro de JSON: {e}")),
            AppError::Zip(e) => ("ZIP_ERROR".to_string(), format!("Erro de ZIP: {e}")),
        };
        ErrorPayload { code, message }.serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
