import { useState, type FormEvent } from "react";
import { CloudApiError, cloudFromConfig } from "../../shared/cloud";
import { useCloudAuth } from "../../shared/cloud-auth";
import { useWorkspace } from "../../shared/workspace";

export function CloudLoginPage() {
  const { config } = useWorkspace();
  const { login, useLocalMode } = useCloudAuth();
  const cloud = cloudFromConfig(config);

  const [apiUrl, setApiUrl] = useState(cloud.apiUrl);
  const [email, setEmail] = useState(cloud.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password, apiUrl);
    } catch (err) {
      if (err instanceof CloudApiError) {
        setError(
          err.status === 401
            ? "E-mail ou senha inválidos."
            : err.message,
        );
      } else {
        setError(
          "Falha ao conectar na API. Verifique se ela está no ar e a URL abaixo.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-card stack">
        <div>
          <div className="brand" style={{ padding: 0 }}>
            SpecDriven
          </div>
          <h1 className="page-title">Entrar na cloud</h1>
          <p className="page-sub">
            Use o mesmo e-mail e senha do portal do consultor para sincronizar
            chamados, comentários e horas.
          </p>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="cloud-api-url">URL da API</label>
            <input
              id="cloud-api-url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://127.0.0.1:3000"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="cloud-email">E-mail</label>
            <input
              id="cloud-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="cloud-password">Senha</label>
            <input
              id="cloud-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Entrando…" : "Entrar"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={submitting}
              onClick={() => void useLocalMode()}
            >
              Usar só modo local
            </button>
          </div>
        </form>

        <p className="muted" style={{ fontSize: "0.8rem" }}>
          Dev: gestor@specdriven.local ou consultor@specdriven.local / changeme
        </p>
      </div>
    </div>
  );
}
