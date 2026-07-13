import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  TICKET_STATUSES,
  type Client,
  type Ticket,
  type TicketStatus,
  type User,
} from "@specdriven/shared";
import { ApiError, listClients, listTickets, listUsers } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  formatDate,
  priorityLabel,
  shortId,
  statusLabel,
  ticketTypeLabel,
} from "../lib/labels";

type AssigneeFilter = "all" | "mine" | "unassigned";

function initialsFromUser(
  assigneeId: string | null | undefined,
  staffMap: Map<string, User>,
): string {
  if (!assigneeId) return "—";
  const u = staffMap.get(assigneeId);
  if (!u?.name) return shortId(assigneeId).slice(0, 2).toUpperCase();
  const parts = u.name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function formatSlaRemaining(dueAt: string | Date | null | undefined): string {
  if (!dueAt) return "—";
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return "Vencido";
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h` : `${h} h`;
}

export function TicketsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const mineFromUrl = searchParams.get("mine") === "1";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [clientId, setClientId] = useState<string>("all");
  const [assignee, setAssignee] = useState<AssigneeFilter>(
    mineFromUrl ? "mine" : "all",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAssignee(mineFromUrl ? "mine" : "all");
  }, [mineFromUrl]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [t, c, u] = await Promise.all([
          listTickets(),
          listClients(),
          listUsers(["gestor", "consultor"]),
        ]);
        if (!cancelled) {
          setTickets(t.tickets);
          setClients(c.clients);
          setStaffUsers(u.users);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Não foi possível carregar a fila.",
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

  const clientName = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? shortId(id);
  }, [clients]);

  const staffMap = useMemo(
    () => new Map(staffUsers.map((u) => [u.id, u])),
    [staffUsers],
  );

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (clientId !== "all" && t.clientId !== clientId) return false;
      if (assignee === "mine" && t.assigneeId !== user?.id) return false;
      if (assignee === "unassigned" && t.assigneeId) return false;
      return true;
    });
  }, [tickets, status, clientId, assignee, user?.id]);

  const pageTitle = mineFromUrl ? "Minha fila." : "Fila de chamados.";
  const pageSubtitle = mineFromUrl
    ? "Chamados atribuídos a você."
    : "Visão global da organização — filtre por status, cliente ou responsável.";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Operação</p>
          <h1 className="page-title-serif">{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>
        <Link className="btn" to="/tickets/new">
          Novo chamado
        </Link>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-section-head">
          <div>
            <h2>Central de chamados</h2>
            <p>{filtered.length} resultado(s)</p>
          </div>
        </div>

        <div style={{ padding: "0 1.25rem 1rem" }}>
          <div className="toolbar">
            <label className="field" style={{ margin: 0, minWidth: 160 }}>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Status
              </span>
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
            <label className="field" style={{ margin: 0, minWidth: 160 }}>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Cliente
              </span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="all">Todos</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ margin: 0, minWidth: 160 }}>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Responsável
              </span>
              <select
                value={assignee}
                onChange={(e) =>
                  setAssignee(e.target.value as AssigneeFilter)
                }
              >
                <option value="all">Todos</option>
                <option value="mine">Meus</option>
                <option value="unassigned">Sem assignee</option>
              </select>
            </label>
          </div>

          {loading ? <p className="muted">Carregando…</p> : null}
          {error ? <p className="error">{error}</p> : null}

          {!loading && !error && filtered.length === 0 ? (
            <p className="empty">Nenhum chamado neste filtro.</p>
          ) : null}

          {!loading && !error && filtered.length > 0 ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Chamado</th>
                    <th>Cliente</th>
                    <th>Classe ITIL</th>
                    <th>Responsável</th>
                    <th>SLA</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link to={`/tickets/${encodeURIComponent(t.key)}`}>
                          <div className="table-key">{t.key}</div>
                          <div className="table-title">{t.title}</div>
                        </Link>
                        <div className="table-meta" style={{ marginTop: "0.25rem" }}>
                          atualizado {formatDate(t.updatedAt)}
                        </div>
                      </td>
                      <td className="table-meta">{clientName(t.clientId)}</td>
                      <td>
                        <div className="table-meta">
                          {ticketTypeLabel(t.ticketType ?? "melhoria")}
                        </div>
                        <div
                          className={`badge-priority-${t.priority ?? "media"}`}
                        >
                          {priorityLabel(t.priority)}
                        </div>
                      </td>
                      <td>
                        <span className="avatar-initials">
                          {initialsFromUser(t.assigneeId, staffMap)}
                        </span>
                      </td>
                      <td className="table-sla">
                        {formatSlaRemaining(t.slaDueAt)}
                      </td>
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
      </div>
    </>
  );
}
