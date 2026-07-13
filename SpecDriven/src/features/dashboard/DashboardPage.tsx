import { Link } from "react-router-dom";
import { useWorkspace } from "../../shared/workspace";
import {
  OPEN_TICKET_STATUSES,
  STATUS_LABELS,
  isOpenTicketStatus,
} from "../../shared/types";
import { formatDate } from "../../shared/components/ui";
import { HoursDashboard } from "./HoursDashboard";
import { api, errorMessage } from "../../shared/api";

export function DashboardPage() {
  const { tree } = useWorkspace();
  const tickets = tree?.tickets ?? [];
  const openCount = tickets.filter((t) => isOpenTicketStatus(t.status)).length;
  const byStatus = OPEN_TICKET_STATUSES.map((s) => ({
    status: s,
    count: tickets.filter((t) => t.status === s).length,
  }));
  const recent = [...tickets].slice(0, 8);

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">
          {tree?.rootPath ? (
            <>
              Raiz: <span className="mono muted">{tree.rootPath}</span>
            </>
          ) : (
            "Sem workspace"
          )}
        </p>
      </div>

      <div className="grid-3">
        <Link className="panel panel-link" to="/clientes">
          <h3>Clientes</h3>
          <div className="stat">{tree?.clients.length ?? 0}</div>
          <span className="panel-link-hint">Ver lista</span>
        </Link>
        <Link className="panel panel-link" to="/relatorios/chamados?filtro=abertos">
          <h3>Chamados abertos</h3>
          <div className="stat">{openCount}</div>
          <span className="panel-link-hint">Ver relatório</span>
        </Link>
        <Link className="panel panel-link" to="/relatorios/chamados">
          <h3>Total de chamados</h3>
          <div className="stat">{tickets.length}</div>
          <span className="panel-link-hint">Ver todos</span>
        </Link>
      </div>

      <HoursDashboard />

      <div className="panel">
        <h3>Por status (abertos)</h3>
        <div className="row">
          {byStatus.map((b) => (
            <span key={b.status} className="badge">
              {STATUS_LABELS[b.status]}: {b.count}
            </span>
          ))}
        </div>
      </div>

      <div className="row">
        <Link className="btn btn-primary" to="/relatorios/chamados">
          Ver todos os chamados
        </Link>
        <Link className="btn" to="/clientes">
          Novo chamado via clientes
        </Link>
        <button
          className="btn"
          onClick={async () => {
            try {
              await api.showTimerOverlay();
            } catch (e) {
              alert(errorMessage(e));
            }
          }}
        >
          Overlay timer
        </button>
        <span className="muted">Busca rápida: Ctrl+K</span>
      </div>

      <div className="panel">
        <h3>Recentes</h3>
        {recent.length === 0 ? (
          <div className="empty">Nenhum chamado ainda. Crie um cliente e um chamado.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Chave</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
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
                  <td>{STATUS_LABELS[t.status]}</td>
                  <td className="muted">{formatDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
