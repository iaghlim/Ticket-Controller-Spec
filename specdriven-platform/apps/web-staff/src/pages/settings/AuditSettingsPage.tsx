import { useCallback, useEffect, useState } from "react";
import { ApiError, listAudit, type AuditEvent } from "../../lib/api";
import { formatDate } from "../../lib/labels";

export function AuditSettingsPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [entityType, setEntityType] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAudit({
        limit: 100,
        entityType: entityType.trim() || undefined,
      });
      setEvents(res.events);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o audit log.",
      );
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="panel-head">
        <h2>Audit log</h2>
        <p>
          Registro de ações sensíveis na organização. Visível para gestor, admin
          e master.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="panel">
        <label className="field">
          <span>Filtrar por tipo de entidade (opcional)</span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="Ex.: ticket, user"
              className="mono"
            />
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              Atualizar
            </button>
          </div>
        </label>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-section-head">
          <div>
            <h3>Eventos recentes</h3>
            <p>Últimos {events.length} registro(s)</p>
          </div>
        </div>
        {loading ? (
          <p className="muted" style={{ padding: "1rem" }}>
            Carregando…
          </p>
        ) : null}
        {!loading && events.length === 0 ? (
          <p className="empty">Nenhum evento registrado.</p>
        ) : null}
        {!loading && events.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>ID</th>
                  <th>Ator</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="table-meta">{formatDate(ev.createdAt)}</td>
                    <td className="mono">{ev.action}</td>
                    <td className="mono">{ev.entityType}</td>
                    <td className="table-meta mono">
                      {ev.entityId ? ev.entityId.slice(0, 8) + "…" : "—"}
                    </td>
                    <td className="table-meta mono">
                      {ev.actorId ? ev.actorId.slice(0, 8) + "…" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
