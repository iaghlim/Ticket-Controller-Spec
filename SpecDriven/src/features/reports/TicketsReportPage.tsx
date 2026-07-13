import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../shared/workspace";
import {
  OPEN_TICKET_STATUSES,
  STATUS_LABELS,
  isOpenTicketStatus,
  type TicketStatus,
} from "../../shared/types";
import { formatDate } from "../../shared/components/ui";

type FilterMode = "all" | "abertos" | TicketStatus;

function parseFilter(raw: string | null): FilterMode {
  if (!raw || raw === "all") return "all";
  if (raw === "abertos") return "abertos";
  if (raw in STATUS_LABELS) return raw as TicketStatus;
  return "all";
}

export function TicketsReportPage() {
  const { tree } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get("filtro"));
  const [clientFilter, setClientFilter] = useState("all");

  const tickets = tree?.tickets ?? [];
  const clients = useMemo(
    () => [...new Set(tickets.map((t) => t.client))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tickets],
  );

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (clientFilter !== "all" && t.client !== clientFilter) return false;
      if (filter === "all") return true;
      if (filter === "abertos") return isOpenTicketStatus(t.status);
      return t.status === filter;
    });
  }, [tickets, filter, clientFilter]);

  const title =
    filter === "abertos"
      ? "Chamados abertos"
      : filter === "all"
        ? "Todos os chamados"
        : `Chamados — ${STATUS_LABELS[filter]}`;

  function setFilter(next: FilterMode) {
    if (next === "all") {
      setSearchParams({});
    } else {
      setSearchParams({ filtro: next });
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">
          {filtered.length} chamado(s)
          {filter === "abertos" && (
            <> · status diferente de {STATUS_LABELS.concluido} / {STATUS_LABELS.cancelado}</>
          )}
        </p>
      </div>

      <div className="row">
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Filtro</label>
          <select
            value={filter}
            onChange={(e) => setFilter(parseFilter(e.target.value))}
          >
            <option value="all">Todos</option>
            <option value="abertos">Abertos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Cliente</label>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="all">Todos</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {filter === "abertos" && (
          <div className="row" style={{ alignSelf: "flex-end", paddingBottom: "0.15rem" }}>
            {OPEN_TICKET_STATUSES.map((s) => (
              <span key={s} className="badge">
                {STATUS_LABELS[s]}: {tickets.filter((t) => t.status === s).length}
              </span>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty">Nenhum chamado neste filtro.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Chave</th>
              <th>Título</th>
              <th>Status</th>
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={`${t.client}/${t.key}`}>
                <td>
                  <Link
                    className="key-link"
                    to={`/clientes/${encodeURIComponent(t.client)}`}
                  >
                    {t.client}
                  </Link>
                </td>
                <td>
                  <Link
                    className="key-link"
                    to={`/chamados/${encodeURIComponent(t.client)}/${encodeURIComponent(t.key)}`}
                  >
                    {t.key}
                  </Link>
                  {t.orphan && <span className="badge warn">órfão</span>}
                </td>
                <td>
                  <Link
                    to={`/chamados/${encodeURIComponent(t.client)}/${encodeURIComponent(t.key)}`}
                  >
                    {t.title || "—"}
                  </Link>
                </td>
                <td>{STATUS_LABELS[t.status]}</td>
                <td className="muted">{formatDate(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
