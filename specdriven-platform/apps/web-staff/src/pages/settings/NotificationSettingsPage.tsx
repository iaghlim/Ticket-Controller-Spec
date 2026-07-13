import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CLIENT_NOTIFICATION_EVENTS,
  STAFF_NOTIFICATION_EVENTS,
  defaultNotificationPrefs,
  type NotificationPrefs,
} from "@specdriven/shared";
import {
  ApiError,
  getSettings,
  patchNotificationSettings,
  type StaffSettingsResponse,
} from "../../lib/api";

const CLIENT_EVENT_LABELS: Record<
  (typeof CLIENT_NOTIFICATION_EVENTS)[number],
  string
> = {
  "ticket.status_changed": "Status alterado pela consultoria",
  "ticket.comment_public": "Consultor respondeu publicamente",
  "ticket.created": "Cliente abriu chamado (confirmação)",
};

const STAFF_EVENT_LABELS: Record<
  (typeof STAFF_NOTIFICATION_EVENTS)[number],
  string
> = {
  "ticket.comment_public": "Cliente comentou publicamente",
  "approval.pending": "Aprovação pendente",
};

export function NotificationSettingsPage() {
  const [data, setData] = useState<StaffSettingsResponse | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultNotificationPrefs());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = data?.canEdit ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      setData(res);
      setPrefs(res.settings.notificationPrefs ?? defaultNotificationPrefs());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar notificações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleClient(
    event: (typeof CLIENT_NOTIFICATION_EVENTS)[number],
    channel: "inApp" | "email",
  ) {
    if (!canEdit) return;
    setPrefs((prev) => ({
      ...prev,
      client: {
        ...prev.client,
        [event]: {
          ...prev.client[event],
          [channel]: !prev.client[event][channel],
        },
      },
    }));
    setOk(null);
  }

  function toggleStaff(
    event: (typeof STAFF_NOTIFICATION_EVENTS)[number],
    channel: "inApp" | "email",
  ) {
    if (!canEdit) return;
    setPrefs((prev) => ({
      ...prev,
      staff: {
        ...prev.staff,
        [event]: {
          ...prev.staff[event],
          [channel]: !prev.staff[event][channel],
        },
      },
    }));
    setOk(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await patchNotificationSettings({ notificationPrefs: prefs });
      setData(res);
      setPrefs(res.settings.notificationPrefs ?? prefs);
      setOk("Preferências de notificação salvas.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar notificações.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted">Carregando notificações…</p>;
  }

  return (
    <div>
      <div className="panel-head">
        <h2>Notificações</h2>
        <p>
          Matriz evento × canal para usuários cliente e equipe.
          {!canEdit ? (
            <span className="muted"> Você tem acesso somente leitura.</span>
          ) : null}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-text">{ok}</p> : null}

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <h3>Usuários cliente</h3>
        <div className="data-table-wrap">
          <table className="data-table data-table-compact">
            <thead>
              <tr>
                <th>Evento</th>
                <th>In-app</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {CLIENT_NOTIFICATION_EVENTS.map((event) => (
                <tr key={event}>
                  <td>{CLIENT_EVENT_LABELS[event]}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={prefs.client[event].inApp}
                      disabled={!canEdit}
                      onChange={() => toggleClient(event, "inApp")}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={prefs.client[event].email}
                      disabled={!canEdit}
                      onChange={() => toggleClient(event, "email")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: "1.5rem" }}>Equipe (staff)</h3>
        <p className="muted">
          Comentário do cliente: assignee + gestores (in-app por padrão).
        </p>
        <div className="data-table-wrap">
          <table className="data-table data-table-compact">
            <thead>
              <tr>
                <th>Evento</th>
                <th>In-app</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {STAFF_NOTIFICATION_EVENTS.map((event) => (
                <tr key={event}>
                  <td>{STAFF_EVENT_LABELS[event]}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={prefs.staff[event].inApp}
                      disabled={!canEdit}
                      onChange={() => toggleStaff(event, "inApp")}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={prefs.staff[event].email}
                      disabled={!canEdit}
                      onChange={() => toggleStaff(event, "email")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit ? (
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
