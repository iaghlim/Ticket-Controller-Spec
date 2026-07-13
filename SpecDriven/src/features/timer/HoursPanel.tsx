import { useCallback, useEffect, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import type { HoursSummary } from "../../shared/types";
import { formatDate } from "../../shared/components/ui";

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

export function HoursPanel({ client, keyName }: { client: string; keyName: string }) {
  const [hours, setHours] = useState<HoursSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [manualMinutes, setManualMinutes] = useState("30");
  const [manualNote, setManualNote] = useState("");

  const load = useCallback(async () => {
    try {
      setHours(await api.listHours(client, keyName));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [client, keyName]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openOverlayAndStart() {
    try {
      await api.showTimerOverlay();
      try {
        await api.startTimer(client, keyName, undefined, false);
      } catch (e) {
        const message = errorMessage(e);
        if (message.includes("Já existe") || message.includes("Confirme")) {
          if (confirm(`${message}\n\nFinalizar o anterior e iniciar aqui?`)) {
            await api.startTimer(client, keyName, undefined, true);
          }
        } else {
          throw e;
        }
      }
      setMsg("Timer iniciado no overlay.");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function addManual() {
    const minutes = Number(manualMinutes.replace(",", "."));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("Informe a duração em minutos (> 0).");
      return;
    }
    const startedAt = new Date(`${manualDate}T09:00:00`).toISOString();
    try {
      setHours(
        await api.addManualEntry(
          client,
          keyName,
          startedAt,
          Math.round(minutes * 60),
          manualNote || undefined,
        ),
      );
      setManualNote("");
      setMsg("Apontamento manual adicionado.");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function exportCsv() {
    try {
      const dest = await save({
        defaultPath: `${keyName}-horas.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!dest) return;
      const res = await api.exportHoursCsv(client, keyName, dest);
      setMsg(`CSV exportado: ${res.path}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Horas</h3>
        <div className="row">
          <button className="btn btn-primary" onClick={() => void openOverlayAndStart()}>
            Timer overlay
          </button>
          <button className="btn" onClick={() => void exportCsv()}>
            Exportar CSV
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="success-banner">{msg}</div>}

      <div className="row">
        <div className="panel" style={{ flex: 1, margin: 0 }}>
          <div className="muted">Hoje</div>
          <div className="stat" style={{ fontSize: "1.25rem" }}>
            {formatDuration(hours?.todaySeconds ?? 0)}
          </div>
        </div>
        <div className="panel" style={{ flex: 1, margin: 0 }}>
          <div className="muted">Esta semana</div>
          <div className="stat" style={{ fontSize: "1.25rem" }}>
            {formatDuration(hours?.weekSeconds ?? 0)}
          </div>
        </div>
        <div className="panel" style={{ flex: 1, margin: 0 }}>
          <div className="muted">Total no chamado</div>
          <div className="stat" style={{ fontSize: "1.25rem" }}>
            {formatDuration(hours?.totalSeconds ?? 0)}
          </div>
        </div>
      </div>

      <div className="panel stack" style={{ margin: 0 }}>
        <strong>Apontamento manual</strong>
        <div className="row">
          <div className="field">
            <label>Data</label>
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Minutos</label>
            <input
              value={manualMinutes}
              onChange={(e) => setManualMinutes(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Nota</label>
            <input
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
            />
          </div>
          <button className="btn" onClick={() => void addManual()}>
            Adicionar
          </button>
        </div>
      </div>

      {(hours?.entries.length ?? 0) === 0 ? (
        <div className="empty">Nenhum apontamento ainda. Use o overlay ou o formulário manual.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Início</th>
              <th>Duração</th>
              <th>Origem</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...(hours?.entries ?? [])].reverse().map((e) => (
              <tr key={e.id}>
                <td className="muted">{formatDate(e.startedAt)}</td>
                <td>{formatDuration(e.seconds)}</td>
                <td>
                  <span className="badge">{e.source === "timer" ? "timer" : "manual"}</span>
                </td>
                <td>{e.note || "—"}</td>
                <td>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!confirm("Remover este apontamento?")) return;
                      try {
                        setHours(await api.deleteHoursEntry(client, keyName, e.id));
                      } catch (err) {
                        setError(errorMessage(err));
                      }
                    }}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
