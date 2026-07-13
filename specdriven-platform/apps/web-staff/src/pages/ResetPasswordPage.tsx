import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, resetPassword } from "../lib/api";

function resetErrorMessage(err: ApiError): string {
  const code = (err.body as { error?: string } | null)?.error;
  switch (code) {
    case "invalid_or_expired_token":
      return "Link inválido ou expirado. Solicite um novo.";
    case "invalid_body":
      return "Senha inválida. Use no mínimo 8 caracteres.";
    default:
      return err.message;
  }
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(
    tokenFromUrl ? null : "Link inválido: token ausente.",
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tokenFromUrl) return;
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await resetPassword(tokenFromUrl, password);
      navigate("/login", {
        replace: true,
        state: { message: res.message },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(resetErrorMessage(err));
      } else {
        setError("Falha ao conectar na API. Verifique se ela está no ar.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="panel login-panel">
        <p className="page-eyebrow" style={{ marginBottom: "0.5rem" }}>
          Portal consultoria
        </p>
        <h1>Nova senha</h1>
        <p className="lead">Defina uma nova senha para sua conta.</p>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="password">Nova senha</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              disabled={!tokenFromUrl}
            />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirmar senha</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              disabled={!tokenFromUrl}
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button
            className="btn"
            type="submit"
            disabled={submitting || !tokenFromUrl}
          >
            {submitting ? "Salvando…" : "Redefinir senha"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
          <Link to="/forgot-password">Solicitar novo link</Link>
          {" · "}
          <Link to="/login">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}
