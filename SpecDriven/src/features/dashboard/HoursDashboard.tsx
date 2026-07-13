import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import type { WorkspaceHoursReport } from "../../shared/types";

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function weekLabel(): string {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export function HoursDashboard() {
  const [report, setReport] = useState<WorkspaceHoursReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await api.getWorkspaceHoursReport());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportWeekCsv() {
    try {
      const dest = await save({
        defaultPath: `horas-semana-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!dest) return;
      const res = await api.exportWeekHoursCsv(dest);
      setMsg(`CSV da semana exportado: ${res.path}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (loading && !report) {
    return (
      <div className="panel">
        <h3>Horas</h3>
        <div className="muted">Carregando apontamentos…</div>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h3 style={{ margin: 0 }}>Horas</h3>
          <div className="muted">Semana atual ({weekLabel()}) — segunda a domingo</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void load()}>
            Atualizar
          </button>
          <button className="btn btn-primary" onClick={() => void exportWeekCsv()}>
            Exportar CSV da semana
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="success-banner">{msg}</div>}

      <div className="grid-3">
        <div className="panel" style={{ margin: 0 }}>
          <div className="muted">Hoje</div>
          <div className="stat">{formatDuration(report?.todaySeconds ?? 0)}</div>
        </div>
        <div className="panel" style={{ margin: 0 }}>
          <div className="muted">Esta semana</div>
          <div className="stat">{formatDuration(report?.weekSeconds ?? 0)}</div>
        </div>
        <div className="panel" style={{ margin: 0 }}>
          <div className="muted">Chamados com horas na semana</div>
          <div className="stat">{report?.byTicket.length ?? 0}</div>
        </div>
      </div>

      {(report?.byClient.length ?? 0) > 0 && (
        <div>
          <h4>Por cliente (semana)</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Hoje</th>
                <th>Semana</th>
              </tr>
            </thead>
            <tbody>
              {report?.byClient.map((c) => (
                <tr key={c.client}>
                  <td>{c.client}</td>
                  <td>{formatDuration(c.todaySeconds)}</td>
                  <td>{formatDuration(c.weekSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(report?.byTicket.length ?? 0) === 0 ? (
        <div className="empty">
          Nenhum apontamento nesta semana. Use o timer ou lançamento manual nos chamados.
        </div>
      ) : (
        <div>
          <h4>Por chamado (semana)</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Hoje</th>
                <th>Semana</th>
              </tr>
            </thead>
            <tbody>
              {report?.byTicket.map((t) => (
                <tr key={`${t.client}/${t.key}`}>
                  <td>
                    <Link
                      className="key-link"
                      to={`/chamados/${encodeURIComponent(t.client)}/${encodeURIComponent(t.key)}`}
                    >
                      {t.key}
                    </Link>
                  </td>
                  <td>{t.title}</td>
                  <td>{t.client}</td>
                  <td>{formatDuration(t.todaySeconds)}</td>
                  <td>{formatDuration(t.weekSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
