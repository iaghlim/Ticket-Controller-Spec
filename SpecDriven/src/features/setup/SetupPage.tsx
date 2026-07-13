import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import { useWorkspace } from "../../shared/workspace";

export function SetupPage() {
  const { config, setConfig, refresh } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chooseFolder() {
    setError(null);
    setBusy(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Escolha a pasta raiz dos atendimentos",
      });
      if (!selected || Array.isArray(selected)) {
        setBusy(false);
        return;
      }
      const cfg = await api.setRootPath(selected);
      setConfig(cfg);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function useRecent(path: string) {
    setError(null);
    setBusy(true);
    try {
      const cfg = await api.setRootPath(path);
      setConfig(cfg);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-card stack">
        <div>
          <div className="brand" style={{ padding: 0 }}>
            SpecDriven
          </div>
          <h1 className="page-title">Configure a pasta de trabalho</h1>
          <p className="page-sub">
            Todos os clientes e chamados ficam nesta pasta local. Nada é enviado para a
            nuvem.
          </p>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={() => void chooseFolder()}>
          Escolher pasta raiz…
        </button>
        {(config?.recentRoots?.length ?? 0) > 0 && (
          <div className="stack">
            <strong>Recentes</strong>
            {config!.recentRoots.map((r) => (
              <button
                key={r}
                className="btn"
                disabled={busy}
                onClick={() => void useRecent(r)}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
