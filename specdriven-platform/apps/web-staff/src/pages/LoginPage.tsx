import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isPlatformMaster } from "../lib/session";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? "/";

  function postLoginPath(roleUser: { role: string; isPlatformContext?: boolean }) {
    if (isPlatformMaster(roleUser as import("../lib/api").AuthUser)) {
      return "/master";
    }
    return from === "/master" ? "/" : from;
  }
  const flashMessage = (location.state as { message?: string } | null)?.message;

  const [email, setEmail] = useState(
    import.meta.env.PROD ? "" : "gestor@specdriven.local",
  );
  const [password, setPassword] = useState(import.meta.env.PROD ? "" : "changeme");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={postLoginPath(user)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await login(email.trim(), password);
      navigate(postLoginPath(loggedIn), { replace: true });
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
          {flashMessage ? <p className="ok-text">{flashMessage}</p> : null}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
          <Link to="/forgot-password">Esqueci minha senha</Link>
        </p>
        {!import.meta.env.PROD ? (
          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.8rem" }}>
            Seed: master@blendit.local, admin@blendit.local, gestor@specdriven.local / changeme
          </p>
        ) : null}
      </div>
    </div>
  );
}
