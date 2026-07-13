import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DEFAULT_BUSINESS_HOURS,
  type Client,
  type SlaPolicy,
} from "@specdriven/shared";
import {
  ApiError,
  createHoliday,
  createSlaPolicy,
  deleteHoliday,
  deleteSlaPolicy,
  getSettings,
  listClients,
  listHolidays,
  listSlaPolicies,
  patchSlaPolicy,
  patchSlaSettings,
  postRecalculateOpenSla,
  type OrganizationHolidayItem,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatMinutes, priorityLabel, shortId } from "../lib/labels";

function emptyFormFromTemplate(template: typeof DEFAULT_BUSINESS_HOURS) {
  return {
    clientId: "",
    name: "default",
    priorityMatch: "",
    responseMinutes: "60",
    resolutionMinutes: "480",
    businessHourStart: String(template.businessHourStart),
    businessHourEnd: String(template.businessHourEnd),
    weekdays: template.weekdays,
  };
}

export function SlaPoliciesPage() {
  const { user } = useAuth();
  const canEdit =
    user?.role === "gestor" ||
    user?.role === "admin" ||
    user?.role === "master";

  const [clients, setClients] = useState<Client[]>([]);
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [filterClientId, setFilterClientId] = useState("");
  const [form, setForm] = useState(emptyFormFromTemplate(DEFAULT_BUSINESS_HOURS));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [slaTargetPct, setSlaTargetPct] = useState("90");
  const [orgHours, setOrgHours] = useState({
    businessHourStart: String(DEFAULT_BUSINESS_HOURS.businessHourStart),
    businessHourEnd: String(DEFAULT_BUSINESS_HOURS.businessHourEnd),
    weekdays: DEFAULT_BUSINESS_HOURS.weekdays,
  });
  const [holidays, setHolidays] = useState<OrganizationHolidayItem[]>([]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [orgSaving, setOrgSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(
    null,
  );
  const [template, setTemplate] = useState(DEFAULT_BUSINESS_HOURS);

  const clientName = useMemo(() => {
    const map = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string) => map.get(id) ?? shortId(id);
  }, [clients]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, p, settingsRes, holidaysRes] = await Promise.all([
        listClients(),
        listSlaPolicies(filterClientId || undefined),
        getSettings(),
        listHolidays(),
      ]);
      setClients(c.clients);
      setPolicies(p.policies);
      setHolidays(holidaysRes.holidays);
      const bh =
        settingsRes.settings.defaultBusinessHours ?? DEFAULT_BUSINESS_HOURS;
      setTemplate(bh);
      setSlaTargetPct(String(settingsRes.settings.slaTargetPct));
      setOrgHours({
        businessHourStart: String(bh.businessHourStart),
        businessHourEnd: String(bh.businessHourEnd),
        weekdays: bh.weekdays,
      });
      setForm((prev) => ({
        ...(editingId ? prev : emptyFormFromTemplate(bh)),
        clientId: prev.clientId || c.clients[0]?.id || "",
      }));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar políticas SLA.",
      );
    } finally {
      setLoading(false);
    }
  }, [filterClientId, editingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveOrgSettings(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setOrgSaving(true);
    setError(null);
    setOk(null);
    try {
      await patchSlaSettings({
        slaTargetPct: Number(slaTargetPct),
        defaultBusinessHours: {
          businessHourStart: Number(orgHours.businessHourStart),
          businessHourEnd: Number(orgHours.businessHourEnd),
          weekdays: orgHours.weekdays.trim(),
        },
      });
      setOk("Configurações de SLA da organização salvas.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao salvar configurações de SLA.",
      );
    } finally {
      setOrgSaving(false);
    }
  }

  async function onRecalculateOpenSla() {
    if (!canEdit) return;
    setRecalculating(true);
    setError(null);
    setOk(null);
    try {
      const res = await postRecalculateOpenSla();
      setOk(`SLA recalculado em ${res.updated} chamado(s) aberto(s).`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao recalcular SLA dos chamados abertos.",
      );
    } finally {
      setRecalculating(false);
    }
  }

  async function onAddHoliday(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !holidayDate) return;
    setHolidaySaving(true);
    setError(null);
    setOk(null);
    try {
      await createHoliday({
        date: holidayDate,
        name: holidayName.trim() || null,
      });
      setHolidayDate("");
      setHolidayName("");
      setOk("Feriado adicionado.");
      const res = await listHolidays();
      setHolidays(res.holidays);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao adicionar feriado.",
      );
    } finally {
      setHolidaySaving(false);
    }
  }

  async function onDeleteHoliday(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Excluir este feriado?")) return;
    setDeletingHolidayId(id);
    setError(null);
    try {
      await deleteHoliday(id);
      setOk("Feriado excluído.");
      const res = await listHolidays();
      setHolidays(res.holidays);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao excluir feriado.",
      );
    } finally {
      setDeletingHolidayId(null);
    }
  }

  function formatHolidayDate(value: string | Date): string {
    const d = typeof value === "string" ? new Date(value) : value;
    return d.toLocaleDateString("pt-BR");
  }

  function startEdit(policy: SlaPolicy) {
    setEditingId(policy.id);
    setForm({
      clientId: policy.clientId,
      name: policy.name,
      priorityMatch: policy.priorityMatch,
      responseMinutes: String(policy.responseMinutes),
      resolutionMinutes: String(policy.resolutionMinutes),
      businessHourStart: String(policy.businessHourStart),
      businessHourEnd: String(policy.businessHourEnd),
      weekdays: policy.weekdays,
    });
    setOk(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({
      ...emptyFormFromTemplate(template),
      clientId: clients[0]?.id || "",
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const body = {
        name: form.name.trim() || "default",
        priorityMatch: form.priorityMatch.trim(),
        responseMinutes: Number(form.responseMinutes),
        resolutionMinutes: Number(form.resolutionMinutes),
        businessHourStart: Number(form.businessHourStart),
        businessHourEnd: Number(form.businessHourEnd),
        weekdays: form.weekdays.trim(),
      };
      if (editingId) {
        await patchSlaPolicy(editingId, body);
        setOk("Política atualizada.");
      } else {
        if (!form.clientId) {
          setError("Selecione um cliente.");
          return;
        }
        await createSlaPolicy({ clientId: form.clientId, ...body });
        setOk("Política criada.");
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar política SLA.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!canEdit) return;
    if (!window.confirm("Excluir esta política SLA?")) return;
    setDeletingId(id);
    setError(null);
    setOk(null);
    try {
      await deleteSlaPolicy(id);
      setOk("Política excluída.");
      if (editingId === id) cancelEdit();
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao excluir política.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title-serif">Políticas de SLA.</h1>
          <p>
            Prazos de resposta e resolução por cliente e prioridade, em horas
            úteis.
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
          Calendário e meta da organização
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Template de horário comercial aplicado a novas políticas; feriados
          empurram prazos SLA em horas úteis.
        </p>
        <form className="form" onSubmit={onSaveOrgSettings}>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="slaTargetPct">Meta SLA (%)</label>
            <input
              id="slaTargetPct"
              type="number"
              min={1}
              max={100}
              value={slaTargetPct}
              disabled={!canEdit}
              onChange={(e) => setSlaTargetPct(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="orgStart">Início expediente padrão (hora)</label>
            <input
              id="orgStart"
              type="number"
              min={0}
              max={23}
              value={orgHours.businessHourStart}
              disabled={!canEdit}
              onChange={(e) =>
                setOrgHours((h) => ({
                  ...h,
                  businessHourStart: e.target.value,
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="orgEnd">Fim expediente padrão (hora)</label>
            <input
              id="orgEnd"
              type="number"
              min={1}
              max={24}
              value={orgHours.businessHourEnd}
              disabled={!canEdit}
              onChange={(e) =>
                setOrgHours((h) => ({ ...h, businessHourEnd: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="orgWeekdays">Dias úteis padrão (1=seg … 7=dom)</label>
            <input
              id="orgWeekdays"
              className="mono"
              value={orgHours.weekdays}
              disabled={!canEdit}
              onChange={(e) =>
                setOrgHours((h) => ({ ...h, weekdays: e.target.value }))
              }
            />
          </div>
          {canEdit ? (
            <div className="form-actions">
              <button className="btn" type="submit" disabled={orgSaving}>
                {orgSaving ? "Salvando…" : "Salvar calendário e meta"}
              </button>
            </div>
          ) : null}
        </form>

        <h3 style={{ fontSize: "1rem", marginTop: "1.5rem" }}>Feriados</h3>
        {holidays.length === 0 ? (
          <p className="muted">Nenhum feriado cadastrado.</p>
        ) : (
          <ul className="gov-list" style={{ marginBottom: "1rem" }}>
            {holidays.map((h) => (
              <li key={h.id} className="gov-row">
                <span>
                  {formatHolidayDate(h.date)}
                  {h.name ? ` — ${h.name}` : ""}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={deletingHolidayId === h.id}
                    onClick={() => void onDeleteHoliday(h.id)}
                  >
                    {deletingHolidayId === h.id ? "…" : "Excluir"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <form className="form" onSubmit={onAddHoliday}>
            <div className="field">
              <label htmlFor="holidayDate">Data</label>
              <input
                id="holidayDate"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="holidayName">Nome (opcional)</label>
              <input
                id="holidayName"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="Ex.: Natal"
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" type="submit" disabled={holidaySaving}>
                {holidaySaving ? "Adicionando…" : "Adicionar feriado"}
              </button>
            </div>
          </form>
        ) : null}

        {canEdit ? (
          <div className="form-actions" style={{ marginTop: "1.25rem" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={recalculating}
              onClick={() => void onRecalculateOpenSla()}
            >
              {recalculating
                ? "Recalculando…"
                : "Recalcular SLA dos chamados abertos"}
            </button>
            <small className="muted" style={{ alignSelf: "center" }}>
              Aplica feriados e políticas atuais aos prazos em aberto.
            </small>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="slaFilterClient">Filtrar por cliente</label>
          <select
            id="slaFilterClient"
            value={filterClientId}
            onChange={(e) => setFilterClientId(e.target.value)}
          >
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-section-head">
          <div>
            <h2>Políticas cadastradas</h2>
            <p>Correspondência por prioridade; vazio = padrão do cliente</p>
          </div>
        </div>
        {loading ? <p className="muted" style={{ padding: "1rem" }}>Carregando…</p> : null}
        {!loading && policies.length === 0 ? (
          <p className="empty">Nenhuma política SLA.</p>
        ) : null}
        {!loading && policies.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Nome</th>
                  <th>Prioridade</th>
                  <th>Resposta</th>
                  <th>Resolução</th>
                  <th>Horário útil</th>
                  {canEdit ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td>{clientName(p.clientId)}</td>
                    <td>{p.name}</td>
                    <td>
                      {p.priorityMatch
                        ? priorityLabel(p.priorityMatch)
                        : "Padrão"}
                    </td>
                    <td>{formatMinutes(p.responseMinutes)}</td>
                    <td>{formatMinutes(p.resolutionMinutes)}</td>
                    <td className="table-meta">
                      {p.businessHourStart}h–{p.businessHourEnd}h · dias{" "}
                      {p.weekdays}
                    </td>
                    {canEdit ? (
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => startEdit(p)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={deletingId === p.id}
                            onClick={() => void onDelete(p.id)}
                          >
                            {deletingId === p.id ? "…" : "Excluir"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            {editingId ? "Editar política" : "Nova política"}
          </h2>
          <form className="form" onSubmit={onSubmit}>
            {!editingId ? (
              <div className="field">
                <label htmlFor="slaClient">Cliente</label>
                <select
                  id="slaClient"
                  value={form.clientId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientId: e.target.value }))
                  }
                  required
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="slaName">Nome</label>
              <input
                id="slaName"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="slaPriority">Prioridade (vazio = padrão)</label>
              <select
                id="slaPriority"
                value={form.priorityMatch}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priorityMatch: e.target.value }))
                }
              >
                <option value="">Padrão (todas)</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="slaResponse">Resposta (minutos úteis)</label>
              <input
                id="slaResponse"
                type="number"
                min={1}
                value={form.responseMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, responseMinutes: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="slaResolution">Resolução (minutos úteis)</label>
              <input
                id="slaResolution"
                type="number"
                min={1}
                value={form.resolutionMinutes}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    resolutionMinutes: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="slaStart">Início expediente (hora)</label>
              <input
                id="slaStart"
                type="number"
                min={0}
                max={23}
                value={form.businessHourStart}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    businessHourStart: e.target.value,
                  }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="slaEnd">Fim expediente (hora)</label>
              <input
                id="slaEnd"
                type="number"
                min={1}
                max={24}
                value={form.businessHourEnd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, businessHourEnd: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="slaWeekdays">Dias úteis (1=seg … 7=dom)</label>
              <input
                id="slaWeekdays"
                className="mono"
                value={form.weekdays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, weekdays: e.target.value }))
                }
                placeholder="1,2,3,4,5"
              />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Salvando…" : editingId ? "Atualizar" : "Criar"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cancelEdit}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : (
        <p className="muted">
          Apenas gestores podem criar ou editar políticas SLA.
        </p>
      )}
    </>
  );
}
