import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TICKET_STATUSES, type Ticket, type TicketStatus } from "@specdriven/shared";
import { ApiError, listTickets } from "../lib/api";
import { useClientContext } from "../lib/useClientContext";
import { formatDate, priorityLabel, statusLabel } from "../lib/labels";

export function TicketsPage() {
  const { clientName } = useClientContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listTickets(
          status === "all" ? undefined : { status },
        );
        if (!cancelled) setTickets(res.tickets);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Não foi possível carregar os chamados.",
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
  }, [status]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Meus chamados</h1>
          <p>
            Acompanhe status e histórico dos atendimentos da {clientName}.
          </p>
        </div>
        <div className="page-head-actions">
          <Link className="btn" to="/tickets/new">
            Novo chamado
          </Link>
        </div>
      </div>

      <div className="panel panel-flush">
        <div className="panel-toolbar">
          <label className="field field-inline">
            <span>Filtrar por status</span>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as TicketStatus | "all")
              }
            >
              <option value="all">Todos</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? <p className="panel-pad muted">Carregando…</p> : null}
        {error ? <p className="panel-pad error">{error}</p> : null}

        {!loading && !error && tickets.length === 0 ? (
          <p className="panel-pad empty">Nenhum chamado neste filtro.</p>
        ) : null}

        {!loading && !error && tickets.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table data-table-compact">
              <thead>
                <tr>
                  <th>Chamado</th>
                  <th>Prioridade</th>
                  <th>Atualização</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link
                        to={`/tickets/${encodeURIComponent(t.key)}`}
                        className="table-hit"
                      >
                        <span className="table-key">{t.key}</span>
                        <span className="table-title">{t.title}</span>
                      </Link>
                    </td>
                    <td className="table-meta">{priorityLabel(t.priority)}</td>
                    <td className="table-meta">{formatDate(t.updatedAt)}</td>
                    <td>
                      <span className={`badge badge-${t.status}`}>
                        {statusLabel(t.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}
