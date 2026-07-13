import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TICKET_TYPES,
  operationsCenterLabel,
  type Ticket,
  type TicketType,
} from "@specdriven/shared";
import { ApiError, listTickets } from "../lib/api";
import { useClientContext } from "../lib/useClientContext";
import {
  formatDate,
  priorityLabel,
  statusLabel,
  ticketTypeLabel,
} from "../lib/labels";

const CATEGORY_META: Record<
  TicketType,
  { desc: string; icon: string; color: string }
> = {
  incidente: {
    desc: "Algo parou ou não está funcionando",
    icon: "⚠",
    color: "#bd1f2d",
  },
  melhoria: {
    desc: "Sugira uma evolução para o serviço",
    icon: "💡",
    color: "#786b86",
  },
  problema: {
    desc: "Reporte uma falha recorrente",
    icon: "🔧",
    color: "#bd7b3e",
  },
  duvida: {
    desc: "Tire uma dúvida sobre a plataforma",
    icon: "?",
    color: "#607a80",
  },
};

function isOpen(t: Ticket): boolean {
  return t.status !== "concluido" && t.status !== "cancelado";
}

export function ClientHomePage() {
  const { clientName, organizationName } = useClientContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listTickets();
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
  }, []);

  const openTickets = useMemo(() => tickets.filter(isOpen), [tickets]);
  const recentTickets = useMemo(
    () =>
      [...tickets]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [tickets],
  );

  const lastUpdate = useMemo(() => {
    if (tickets.length === 0) return null;
    const latest = tickets.reduce((acc, t) =>
      new Date(t.updatedAt) > new Date(acc.updatedAt) ? t : acc,
    );
    return formatDate(latest.updatedAt);
  }, [tickets]);

  return (
    <>
      <section className="hero-banner">
        <div className="hero-deco hero-deco-lg" aria-hidden />
        <div className="hero-deco hero-deco-sm" aria-hidden />
        <p className="hero-eyebrow">Ambiente seguro · {clientName}</p>
        <div className="hero-body">
          <div>
            <h1 className="hero-title">Como podemos ajudar?</h1>
            <p className="hero-lead">
              Abra um chamado ou acompanhe os serviços da sua empresa.
            </p>
            <p className="hero-meta muted">
              {operationsCenterLabel(organizationName)}
            </p>
          </div>
          <Link className="btn hero-cta" to="/tickets/new">
            <span aria-hidden>+</span>
            Abrir chamado
          </Link>
        </div>
      </section>

      <div className="home-split">
        <section>
          <div className="section-head">
            <div>
              <h2>Meus chamados</h2>
              <p className="muted">
                Visível apenas para usuários da {clientName}
              </p>
            </div>
            <Link className="section-link" to="/tickets">
              Ver todos <span aria-hidden>↗</span>
            </Link>
          </div>

          <div className="panel panel-flush">
            {loading ? <p className="panel-pad muted">Carregando…</p> : null}
            {error ? <p className="panel-pad error">{error}</p> : null}

            {!loading && !error && recentTickets.length === 0 ? (
              <p className="panel-pad empty">Nenhum chamado ainda.</p>
            ) : null}

            {!loading && !error && recentTickets.length > 0 ? (
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
                    {recentTickets.map((t) => (
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
                        <td className="table-meta">
                          {priorityLabel(t.priority)}
                        </td>
                        <td className="table-meta">
                          {formatDate(t.updatedAt)}
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
        </section>

        <aside className="panel tracking-sidebar">
          <div className="tracking-head">
            <div>
              <h2>Acompanhamento</h2>
              <p className="muted">Resumo da sua empresa</p>
            </div>
            <span className="tracking-icon" aria-hidden>
              ◎
            </span>
          </div>
          <div className="tracking-rows">
            <div className="tracking-row">
              <span>Chamados em aberto</span>
              <strong className="mono">
                {loading ? "—" : String(openTickets.length).padStart(2, "0")}
              </strong>
            </div>
            <div className="tracking-row">
              <span>SLA do mês</span>
              <strong className="mono tracking-highlight">—</strong>
            </div>
            <div className="tracking-row">
              <span>Última atualização</span>
              <strong>{lastUpdate ?? "—"}</strong>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" disabled>
            Consultar base de conhecimento
          </button>
        </aside>
      </div>

      <section className="home-categories">
        <div className="section-head">
          <div>
            <h2>Precisa abrir um chamado?</h2>
            <p className="muted">
              Escolha a categoria mais próxima. Nossa equipe direcionará sua
              solicitação.
            </p>
          </div>
        </div>
        <div className="category-grid">
          {TICKET_TYPES.map((type) => {
            const meta = CATEGORY_META[type];
            return (
              <Link
                key={type}
                to={`/tickets/new?type=${encodeURIComponent(type)}`}
                className="category-card"
              >
                <span
                  className="category-icon"
                  style={{ color: meta.color }}
                  aria-hidden
                >
                  {meta.icon}
                </span>
                <p className="category-name">{ticketTypeLabel(type)}</p>
                <p className="category-desc">{meta.desc}</p>
                <span className="category-action">
                  Selecionar <span aria-hidden>›</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="info-strip">
        <div className="info-strip-item">
          <span className="info-strip-icon" aria-hidden>
            🛡
          </span>
          <div>
            <p className="info-strip-title">Acesso segregado</p>
            <p className="muted">
              Sua empresa visualiza exclusivamente seus próprios chamados,
              anexos e histórico.
            </p>
          </div>
        </div>
        <div className="info-strip-item">
          <span className="info-strip-icon" aria-hidden>
            ✉
          </span>
          <div>
            <p className="info-strip-title">Comunicação centralizada</p>
            <p className="muted">
              Responda atualizações, envie anexos e acompanhe cada etapa em um
              único lugar.
            </p>
          </div>
        </div>
        <div className="info-strip-item">
          <span className="info-strip-icon" aria-hidden>
            ✓
          </span>
          <div>
            <p className="info-strip-title">Acompanhamento transparente</p>
            <p className="muted">
              Veja prioridade, SLA e o status atual de cada solicitação.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
