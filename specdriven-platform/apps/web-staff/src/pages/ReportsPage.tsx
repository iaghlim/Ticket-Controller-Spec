import { useEffect, useMemo, useState } from "react";
import {
  TICKET_STATUSES,
  type TicketStatus,
  type User,
} from "@specdriven/shared";
import {
  ApiError,
  listUsers,
  ticketsReport,
  type TicketsReport,
  apiBaseUrl,
  getStoredToken,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { shortId, statusLabel } from "../lib/labels";

export function ReportsPage() {
  const { user } = useAuth();
  const [report, setReport] = useState<TicketsReport | null>(null);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [res, u] = await Promise.all([
          ticketsReport(),
          listUsers(["gestor", "consultor"]),
        ]);
        if (!cancelled) {
          setReport(res);
          setStaffUsers(u.users);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Não foi possível carregar o relatório.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const byAssignee = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.byAssignee).sort((a, b) => b[1] - a[1]);
  }, [report]);

  const assigneeLabel = useMemo(() => {
    const map = new Map(staffUsers.map((u) => [u.id, u.name]));
    return (id: string) => {
      const name = map.get(id);
      if (id === user?.id) return name ? `${name} (você)` : "você";
      return name ?? shortId(id);
    };
  }, [staffUsers, user?.id]);

  const openCount = useMemo(() => {
    if (!report) return 0;
    return TICKET_STATUSES.filter(
      (s) => s !== "concluido" && s !== "cancelado",
    ).reduce((sum, s) => sum + (report.byStatus[s] ?? 0), 0);
  }, [report]);

  const handleExportCsv = async () => {
    try {
      const auth = getStoredToken();
      const response = await fetch(`${apiBaseUrl}/reports/tickets.csv`, {
        headers: {
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Falha ao exportar CSV");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar o relatório CSV.");
    }
  };

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title-serif">Relatórios.</h1>
          <p>Agregações e visão de esforço da operação.</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="btn"
          style={{ height: "38px" }}
        >
          Exportar CSV
        </button>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {report && !loading ? (
        <>
          <div className="stats-row">
            <div className="stat">
              <span className="stat-label">Total</span>
              <strong className="stat-value">{report.total}</strong>
            </div>
            <div className="stat">
              <span className="stat-label">Abertos</span>
              <strong className="stat-value">{openCount}</strong>
            </div>
            <div className="stat">
              <span className="stat-label">Sem assignee</span>
              <strong className="stat-value">{report.unassigned}</strong>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Esforço por status</h2>
                <p>Distribuição de chamados no período</p>
              </div>
            </div>
            <div className="bar-chart">
              {TICKET_STATUSES.map((s, i) => {
                const count = report.byStatus[s] ?? 0;
                const max = Math.max(
                  ...TICKET_STATUSES.map((st) => report.byStatus[st] ?? 0),
                  1,
                );
                const height = Math.round((count / max) * 100);
                return (
                  <div key={s} className="bar-chart-col" title={statusLabel(s)}>
                    <div
                      className={`bar-chart-bar${i === TICKET_STATUSES.length - 2 ? " active" : ""}`}
                      style={{ height: `${Math.max(height, 4)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="bar-chart-labels">
              {TICKET_STATUSES.map((s) => (
                <span key={s}>{statusLabel(s).slice(0, 3)}</span>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Por status</h2>
            <ul className="ticket-list">
              {TICKET_STATUSES.map((s: TicketStatus) => (
                <li key={s} className="ticket-row">
                  <div className="ticket-title">{statusLabel(s)}</div>
                  <span className={`badge badge-${s}`}>
                    {report.byStatus[s] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Por assignee</h2>
            {byAssignee.length === 0 && report.unassigned === 0 ? (
              <p className="muted">Sem dados.</p>
            ) : (
              <ul className="ticket-list">
                {byAssignee.map(([id, count]) => (
                  <li key={id} className="ticket-row">
                    <div className="ticket-title">{assigneeLabel(id)}</div>
                    <span className="badge badge-backlog">{count}</span>
                  </li>
                ))}
                {report.unassigned > 0 ? (
                  <li className="ticket-row">
                    <div className="ticket-title">Sem assignee</div>
                    <span className="badge badge-backlog">
                      {report.unassigned}
                    </span>
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
