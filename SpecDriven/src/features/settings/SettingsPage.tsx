import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import {
  cloudFromConfig,
  cloudSyncPull,
  cloudSyncPush,
} from "../../shared/cloud";
import { useCloudAuth } from "../../shared/cloud-auth";
import type { CloudMode } from "../../shared/types";
import { useWorkspace } from "../../shared/workspace";

export function SettingsPage() {
  const { config, setConfig, refresh } = useWorkspace();
  const { user, login, logout, isCloudMode } = useCloudAuth();
  const [author, setAuthor] = useState(config?.authorDefault ?? "");
  const [placeholder, setPlaceholder] = useState(config?.emptyPlaceholder ?? "—");
  const [theme, setTheme] = useState(config?.ui?.theme ?? "system");
  const initialCloud = cloudFromConfig(config);
  const [cloudMode, setCloudMode] = useState<CloudMode>(initialCloud.mode);
  const [apiUrl, setApiUrl] = useState(initialCloud.apiUrl);
  const [email, setEmail] = useState(initialCloud.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    try {
      const cfg = await api.updateConfig({
        authorDefault: author,
        emptyPlaceholder: placeholder,
        theme,
        cloudMode,
        cloudApiUrl: apiUrl,
      });
      setConfig(cfg);
      document.documentElement.dataset.theme = theme;
      setMsg("Configurações salvas.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function loginCloud() {
    setError(null);
    setBusy(true);
    try {
      await login(email, password, apiUrl);
      setCloudMode("cloud");
      setPassword("");
      setMsg("Login cloud OK.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function logoutCloud() {
    setError(null);
    try {
      await logout();
      setCloudMode("local");
      setMsg("Sessão cloud encerrada (modo Local).");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function runSync() {
    setError(null);
    setBusy(true);
    try {
      const cloud = cloudFromConfig(config);
      if (cloud.mode !== "cloud" || !cloud.token) {
        throw new Error("Ative o modo Cloud e faça login antes de sincronizar.");
      }
      const pulled = await cloudSyncPull(cloud);
      const applied = await api.applyCloudPull({
        tickets: pulled.tickets,
        comments: pulled.comments,
        timeEntries: pulled.timeEntries,
      });
      // Push vazio no MVP — timer push será ligado no stop do timer.
      await cloudSyncPush(cloud, {});
      const cfg = await api.updateConfig({
        cloudLastSyncAt: pulled.serverTime,
      });
      setConfig(cfg);
      await refresh();
      const skip =
        applied.skipped.length > 0
          ? ` · ${applied.skipped.length} ignorado(s)`
          : "";
      setMsg(
        `Sync OK: ${applied.ticketsCreated} criados, ${applied.ticketsUpdated} atualizados, ` +
          `${applied.commentsAppended} comentários, ${applied.timeEntriesMerged} horas no disco` +
          ` (pull ${pulled.tickets.length}/${pulled.comments.length}/${pulled.timeEntries.length})${skip}.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function changeRoot() {
    if (!confirm("Trocar a pasta raiz? O workspace atual será substituído na sessão.")) {
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Nova pasta raiz",
      });
      if (!selected || Array.isArray(selected)) return;
      const cfg = await api.setRootPath(selected);
      setConfig(cfg);
      await refresh();
      setMsg("Raiz atualizada.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="page-sub">Preferências locais e sync cloud (Fase D).</p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="success-banner">{msg}</div>}

      <div className="panel stack">
        <div className="field">
          <label>Autor padrão</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div className="field">
          <label>Placeholder para campos vazios no .docx</label>
          <input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} />
        </div>
        <div className="field">
          <label>Tema</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="system">Sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => void save()}>
            Salvar
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h3>Modo Local | Cloud</h3>
        <p className="muted">
          Local = 100% workspace em disco. Cloud = login na API SpecDriven + sync de
          tickets/comentários/horas e upload de .docx como anexo.
        </p>
        <div className="field">
          <label>Modo</label>
          <select
            value={cloudMode}
            onChange={(e) => setCloudMode(e.target.value as CloudMode)}
          >
            <option value="local">Local</option>
            <option value="cloud">Cloud</option>
          </select>
        </div>
        <div className="field">
          <label>URL da API</label>
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://127.0.0.1:3000"
          />
        </div>
        {cloudMode === "cloud" && (
          <>
            <div className="field">
              <label>E-mail</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="row">
              <button
                className="btn btn-primary"
                disabled={busy || !email || !password}
                onClick={() => void loginCloud()}
              >
                Entrar na cloud
              </button>
              <button className="btn" disabled={busy} onClick={() => void runSync()}>
                Sincronizar agora
              </button>
              <button className="btn" disabled={busy} onClick={() => void logoutCloud()}>
                Sair
              </button>
            </div>
            {user && (
              <p className="muted mono">
                Sessão: {user.name} ({user.email})
                {config?.cloud?.lastSyncAt
                  ? ` · último sync ${config.cloud.lastSyncAt}`
                  : ""}
              </p>
            )}
            {isCloudMode && !user && (
              <p className="muted">Faça login para usar o modo Cloud.</p>
            )}
          </>
        )}
        <div className="row">
          <button className="btn" onClick={() => void save()}>
            Salvar modo/URL
          </button>
        </div>
      </div>

      <div className="panel stack">
        <h3>Pasta raiz</h3>
        <p className="mono muted">{config?.rootPath || "—"}</p>
        <button className="btn" onClick={() => void changeRoot()}>
          Trocar raiz…
        </button>
        {(config?.recentRoots?.length ?? 0) > 0 && (
          <div className="stack">
            <strong>Recentes</strong>
            {config!.recentRoots.map((r) => (
              <button
                key={r}
                className="btn"
                onClick={async () => {
                  try {
                    const cfg = await api.setRootPath(r);
                    setConfig(cfg);
                    await refresh();
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Templates embutidos</h3>
        <p className="muted">
          Os templates Word ficam em <code>src-tauri/templates/</code> (EF.docx, ET.docx,
          TestesUnitarios.docx). Placeholders no formato <code>{`{{campo}}`}</code> devem
          permanecer em um único trecho de texto no Word.
        </p>
      </div>
    </div>
  );
}
