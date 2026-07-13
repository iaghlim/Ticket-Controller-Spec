import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TICKET_TYPES,
  operationsCenterLabel,
  type Client,
  type Ticket,
  type TicketType,
  type User,
} from "@specdriven/shared";
import {
  ApiError,
  listApprovals,
  listClients,
  listTickets,
  listUsers,
  ticketsReport,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  NOT_CONFIGURED,
  priorityLabel,
  shortId,
  statusLabel,
  ticketTypeLabel,
} from "../lib/labels";

const LIFECYCLE_META: Record<
  TicketType,
  { desc: string; icon: string; color: string }
> = {
  incidente: {
    desc: "Interrupção não planejada",
    icon: "⚠",
    color: "#bd1f2d",
  },
  melhoria: {
    desc: "Evoluções priorizadas",
    icon: "💡",
    color: "#82758a",
  },
  problema: {
    desc: "Causa raiz em análise",
    icon: "🔧",
    color: "#d77a45",
  },
  duvida: {
    desc: "Orientação e suporte",
    icon: "?",
    color: "#8d9a9d",
  },
};

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
  if (h < 24) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return "Ontem";
}

function weekdayDate(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function OverviewPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingHoursSeconds, setPendingHoursSeconds] = useState(0);
  const [reportTotal, setReportTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [t, c, u, approvals, report] = await Promise.all([
          listTickets(),
          listClients(),
          listUsers(["gestor", "consultor"]),
          listApprovals({ status: "pending" }),
          ticketsReport(),
        ]);
        if (cancelled) return;
        setTickets(t.tickets);
        setClients(c.clients);
        setStaffUsers(u.users);
        setPendingApprovals(approvals.approvals.length);
        const timeEntries = approvals.approvals.filter(
          (a) => a.kind === "time_entry",
        );
        setPendingHoursSeconds(
          timeEntries.reduce((sum, a) => {
            const te = a.timeEntry as { seconds?: number } | undefined;
            return sum + (te?.seconds ?? 0);
          }, 0),
        );
        setReportTotal(report.total);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Não foi possível carregar a visão geral.",
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

  const openTickets = useMemo(
    () =>
      tickets.filter(
        (t) => t.status !== "concluido" && t.status !== "cancelado",
      ),
    [tickets],
  );

  const slaOkPct = useMemo(() => {
    const withSla = openTickets.filter((t) => t.slaDueAt);
    if (withSla.length === 0) return null;
    const ok = withSla.filter((t) => {
      const due = new Date(t.slaDueAt!);
      return due.getTime() > Date.now();
    }).length;
    return Math.round((ok / withSla.length) * 1000) / 10;
  }, [openTickets]);

  const slaAtRisk = useMemo(() => {
    return openTickets.filter((t) => {
      if (!t.slaDueAt) return false;
      const due = new Date(t.slaDueAt);
      const diff = due.getTime() - Date.now();
      return diff > 0 && diff < 2 * 60 * 60 * 1000;
    }).length;
  }, [openTickets]);

  const clientsWithTickets = useMemo(() => {
    return new Set(openTickets.map((t) => t.clientId)).size;
  }, [openTickets]);

  const byType = useMemo(() => {
    const counts: Record<TicketType, number> = {
      incidente: 0,
      melhoria: 0,
      problema: 0,
      duvida: 0,
    };
    for (const t of openTickets) {
      const type = t.ticketType ?? "melhoria";
      if (type in counts) counts[type as TicketType]++;
    }
    return counts;
  }, [openTickets]);

  const attention = useMemo(() => {
    const priorityWeight: Record<string, number> = {
      critica: 4,
      alta: 3,
      media: 2,
      baixa: 1,
    };
    return [...openTickets]
      .sort((a, b) => {
        const pa = priorityWeight[a.priority ?? "media"] ?? 2;
        const pb = priorityWeight[b.priority ?? "media"] ?? 2;
        if (pb !== pa) return pb - pa;
        const da = a.slaDueAt ? new Date(a.slaDueAt).getTime() : Infinity;
        const db = b.slaDueAt ? new Date(b.slaDueAt).getTime() : Infinity;
        return da - db;
      })
      .slice(0, 5);
  }, [openTickets]);

  const pendingHoursLabel =
    pendingHoursSeconds > 0
      ? `${(pendingHoursSeconds / 3600).toFixed(1).replace(".", ",")}h`
      : "0h";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">
            {operationsCenterLabel(user?.organizationName ?? "Consultoria")}
          </p>
          <h1 className="page-title-serif">Visão da operação.</h1>
          <p>
            {weekdayDate()} · Acompanhe serviços, chamados e compromissos.
          </p>
        </div>
        <div className="page-head-actions">
          <span className="page-head-unconfigured">
            Período · <span className="unconfigured-label">{NOT_CONFIGURED}</span>
          </span>
        </div>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-card-icon primary">◎</span>
              <p className="kpi-card-label">Chamados ativos</p>
              <p className="kpi-card-value">{openTickets.length}</p>
              <p className="kpi-card-note">
                <strong>{reportTotal}</strong>{" "}
                <span className="muted">no total</span>
              </p>
              <div className="kpi-card-accent" />
            </div>
            <div className="kpi-card">
              <span className="kpi-card-icon">◔</span>
              <p className="kpi-card-label">SLA cumprido</p>
              <p className="kpi-card-value">
                {slaOkPct != null ? (
                  `${slaOkPct}%`
                ) : (
                  <span className="unconfigured-label">{NOT_CONFIGURED}</span>
                )}
              </p>
              <p className="kpi-card-note">meta ≥ 90%</p>
            </div>
            <div className="kpi-card">
              <span className="kpi-card-icon">◷</span>
              <p className="kpi-card-label">Tempo de resposta</p>
              <p className="kpi-card-value">
                <span className="unconfigured-label">{NOT_CONFIGURED}</span>
              </p>
              <p className="kpi-card-note">média do período</p>
            </div>
            <div className="kpi-card">
              <span className="kpi-card-icon">◴</span>
              <p className="kpi-card-label">Horas pendentes</p>
              <p className="kpi-card-value">{pendingHoursLabel}</p>
              <p className="kpi-card-note">
                {pendingApprovals} lançamentos para aprovação
              </p>
            </div>
          </section>

          <section className="lifecycle-panel">
            <div className="panel-section-head">
              <div>
                <h2>Ciclo de vida de chamados</h2>
                <p>Classificação alinhada às práticas de gestão de serviços ITIL</p>
              </div>
              <Link to="/tickets" className="btn btn-ghost btn-sm">
                Ver backlog
              </Link>
            </div>
            <div className="lifecycle-grid">
              {TICKET_TYPES.map((type) => {
                const meta = LIFECYCLE_META[type];
                return (
                  <Link
                    key={type}
                    to="/tickets"
                    className="lifecycle-item"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span
                      className="lifecycle-icon"
                      style={{ color: meta.color }}
                    >
                      {meta.icon}
                    </span>
                    <div>
                      <div className="lifecycle-name">
                        {ticketTypeLabel(type)}
                      </div>
                      <p className="lifecycle-desc">{meta.desc}</p>
                    </div>
                    <span
                      className="lifecycle-count"
                      style={{ color: meta.color }}
                    >
                      {byType[type]}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="split-grid">
            <section className="panel" style={{ padding: 0 }}>
              <div className="panel-section-head">
                <div>
                  <h2>Chamados que pedem atenção</h2>
                  <p>Prioridade, impacto e risco de SLA</p>
                </div>
                <Link to="/tickets" className="btn btn-dark btn-sm">
                  Todos
                </Link>
              </div>
              {attention.length === 0 ? (
                <p className="empty">Nenhum chamado aberto.</p>
              ) : (
                <>
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
                        {attention.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <Link to={`/tickets/${encodeURIComponent(t.key)}`}>
                                <div className="table-key">{t.key}</div>
                                <div className="table-title">{t.title}</div>
                              </Link>
                            </td>
                            <td className="table-meta">
                              {clientName(t.clientId)}
                            </td>
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
                  <div className="table-footer">
                    <span>
                      Mostrando {attention.length} de {openTickets.length}{" "}
                      chamados ativos
                    </span>
                    <Link to="/tickets">Acessar central →</Link>
                  </div>
                </>
              )}
            </section>

            <aside className="stack">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Governança de serviço</h2>
                    <p>Clientes &amp; compromissos</p>
                  </div>
                </div>
                <div className="gov-list">
                  <div className="gov-row">
                    <span>SLAs em risco</span>
                    <span className="gov-row-value danger">
                      {String(slaAtRisk).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="gov-row">
                    <span>Clientes com chamados</span>
                    <span className="gov-row-value">
                      {String(clientsWithTickets).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="gov-row">
                    <span>Chamados na fila</span>
                    <span className="gov-row-value">
                      {openTickets.length}/{reportTotal || tickets.length}
                    </span>
                  </div>
                </div>
                <Link
                  to="/reports"
                  className="btn btn-ghost btn-sm"
                  style={{ width: "100%" }}
                >
                  Gerenciar SLA &amp; Baseline →
                </Link>
              </section>

              <section className="dark-card">
                <div className="dark-card-eyebrow">Aprovações</div>
                <h3>{pendingHoursLabel} aguardam revisão</h3>
                <p>
                  {pendingApprovals} lançamentos precisam de aprovação
                  {user?.role === "gestor" ? " sua" : ""}.
                </p>
                <Link to="/approvals">Revisar horas →</Link>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </>
  );
}
