import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("gestor@specdriven.local");
  const [password, setPassword] = useState("changeme");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "E-mail ou senha inválidos."
            : err.message,
        );
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
        <h1>SpecDriven</h1>
        <p className="lead">
          Portal da consultoria — fila, atribuição e gestão de clientes.
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
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
          Seed: master@blendit.local, admin@blendit.local, gestor@specdriven.local / changeme
        </p>
      </div>
    </div>
  );
}
