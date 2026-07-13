import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, forgotPassword } from "../lib/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await forgotPassword(email.trim());
      setMessage(res.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao conectar na API. Verifique se ela está no ar.",
      );
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
        <h1>Esqueci minha senha</h1>
        <p className="lead">
          Informe seu e-mail. Se estiver cadastrado, você receberá um link para
          redefinir a senha.
        </p>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!!message}
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="ok-text">{message}</p> : null}
          <button
            className="btn"
            type="submit"
            disabled={submitting || !!message}
          >
            {submitting ? "Enviando…" : "Enviar link"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
          <Link to="/login">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
}
