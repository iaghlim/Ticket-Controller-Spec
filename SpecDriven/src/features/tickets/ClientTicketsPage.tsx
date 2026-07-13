import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../../shared/api";
import { useWorkspace } from "../../shared/workspace";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type Priority,
  type TicketStatus,
} from "../../shared/types";
import { Modal, formatDate } from "../../shared/components/ui";

export function ClientTicketsPage() {
  const { clientName = "" } = useParams();
  const client = decodeURIComponent(clientName);
  const { tree, refresh, config } = useWorkspace();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    key: "",
    title: "",
    jiraUrl: "",
    estimativaHoras: "",
    tags: "",
    priority: "media" as Priority,
    status: "backlog" as TicketStatus,
  });

  const tickets = useMemo(
    () =>
      (tree?.tickets ?? []).filter(
        (t) =>
          t.client === client &&
          (statusFilter === "all" || t.status === statusFilter),
      ),
    [tree, client, statusFilter],
  );

  async function create() {
    setError(null);
    try {
      const detail = await api.createTicket({
        client,
        key: form.key.trim().toUpperCase(),
        title: form.title,
        jiraUrl: form.jiraUrl || undefined,
        estimativaHoras: form.estimativaHoras
          ? Number(form.estimativaHoras.replace(",", "."))
          : undefined,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        priority: form.priority,
        status: form.status,
        author: config?.authorDefault || undefined,
      });
      setCreateOpen(false);
      await refresh();
      navigate(
        `/chamados/${encodeURIComponent(detail.meta.client)}/${encodeURIComponent(detail.meta.key)}`,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function docBadges(t: (typeof tickets)[0]) {
    return (
      <span className="tag-list">
        <span className={`badge ${t.documents.ef.exists ? "ok" : "muted"}`}>EF</span>
        <span className={`badge ${t.documents.et.exists ? "ok" : "muted"}`}>ET</span>
        <span className={`badge ${t.documents.testesUnitarios.exists ? "ok" : "muted"}`}>
          TU
        </span>
      </span>
    );
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">{client}</h1>
          <p className="page-sub">
            <Link to="/clientes">Clientes</Link> · {tickets.length} chamado(s)
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          Novo chamado
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="row">
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Filtrar status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="empty">Nenhum chamado neste cliente.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Chave</th>
              <th>Título</th>
              <th>Status</th>
              <th>Docs</th>
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.key}>
                <td>
                  <Link
                    className="key-link"
                    to={`/chamados/${encodeURIComponent(t.client)}/${encodeURIComponent(t.key)}`}
                  >
                    {t.key}
                  </Link>
                  {t.orphan && <span className="badge warn">órfão</span>}
                </td>
                <td>{t.title}</td>
                <td>{STATUS_LABELS[t.status]}</td>
                <td>{docBadges(t)}</td>
                <td className="muted">{formatDate(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={createOpen} title="Novo chamado" onClose={() => setCreateOpen(false)}>
        <div className="stack">
          <div className="field">
            <label>Chave Jira (ex.: PROJ-123)</label>
            <input
              className="mono"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Título</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>URL Jira (opcional)</label>
            <input
              value={form.jiraUrl}
              onChange={(e) => setForm({ ...form, jiraUrl: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Estimativa (horas, opcional)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.estimativaHoras}
              onChange={(e) => setForm({ ...form, estimativaHoras: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Tags (separadas por vírgula)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
          <div className="row">
            <div className="field">
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as TicketStatus })
                }
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Prioridade</label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => void create()}>
              Criar
            </button>
            <button className="btn" onClick={() => setCreateOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
