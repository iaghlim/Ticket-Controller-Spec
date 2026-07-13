import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Client, User } from "@specdriven/shared";
import {
  ApiError,
  getBillingSummary,
  listClients,
  listUsers,
  patchClientBilling,
  patchUserBilling,
  type BillingSummary,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatCents, formatHours, roleLabel } from "../lib/labels";

function monthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function monthLabel(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function BillingPage() {
  const { user } = useAuth();
  const isGestor =
    user?.role === "gestor" ||
    user?.role === "admin" ||
    user?.role === "master";

  const [clients, setClients] = useState<Client[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [clientId, setClientId] = useState("");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const [baselineHours, setBaselineHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, u] = await Promise.all([
        listClients(),
        listUsers(["gestor", "consultor"]),
      ]);
      setClients(c.clients);
      setStaffUsers(u.users);
      setClientId((prev) => prev || c.clients[0]?.id || "");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar clientes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (id: string) => {
    if (!id) {
      setSummary(null);
      return;
    }
    setLoadingSummary(true);
    setError(null);
    try {
      const { from, to } = monthRange();
      const res = await getBillingSummary(id, from, to);
      setSummary(res);
      setBaselineHours(
        res.client.baselineHoursMonth != null
          ? String(res.client.baselineHoursMonth)
          : "",
      );
      setHourlyRate(
        res.client.hourlyRateCents != null
          ? String(res.client.hourlyRateCents / 100)
          : "",
      );
    } catch (err) {
      setSummary(null);
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o resumo de baseline.",
      );
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (clientId) void loadSummary(clientId);
  }, [clientId, loadSummary]);

  async function onSaveClientBilling(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !isGestor) return;
    setSavingClient(true);
    setError(null);
    setOk(null);
    try {
      const baselineVal = baselineHours.trim()
        ? Number(baselineHours.replace(",", "."))
        : null;
      const rateVal = hourlyRate.trim()
        ? Math.round(Number(hourlyRate.replace(",", ".")) * 100)
        : null;
      await patchClientBilling(clientId, {
        baselineHoursMonth: baselineVal,
        hourlyRateCents: rateVal,
      });
      setOk("Parâmetros de baseline atualizados.");
      await loadSummary(clientId);
      await loadClients();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar baseline.",
      );
    } finally {
      setSavingClient(false);
    }
  }

  async function onSaveUserFactor(u: User, factor: string) {
    if (!isGestor) return;
    const val = Number(factor.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) return;
    setSavingUserId(u.id);
    setError(null);
    setOk(null);
    try {
      await patchUserBilling(u.id, val);
      setOk(`Fator de ${u.name} atualizado.`);
      if (clientId) await loadSummary(clientId);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar fator hora.",
      );
    } finally {
      setSavingUserId(null);
    }
  }

  const baselinePct = useMemo(() => {
    if (!summary?.client.baselineHoursMonth) return null;
    const used = summary.hoursUsed;
    const total = summary.client.baselineHoursMonth;
    if (total <= 0) return null;
    return Math.min(100, Math.round((used / total) * 1000) / 10);
  }, [summary]);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title-serif">Baseline e faturamento.</h1>
          <p>
            Consumo de horas aprovadas e custo interno · {monthLabel()}
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}

      <div className="panel">
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="billingClient">Cliente</label>
          <select
            id="billingClient"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={loading || clients.length === 0}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingSummary ? <p className="muted">Carregando resumo…</p> : null}

      {summary && !loadingSummary ? (
        <>
          <section className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-card-icon primary">◷</span>
              <p className="kpi-card-label">Horas consumidas</p>
              <p className="kpi-card-value">{formatHours(summary.hoursUsed)}</p>
              <p className="kpi-card-note">
                {summary.entryCount} lançamentos aprovados
              </p>
              <div className="kpi-card-accent" />
            </div>
            <div className="kpi-card">
              <span className="kpi-card-icon">◔</span>
              <p className="kpi-card-label">Baseline restante</p>
              <p className="kpi-card-value">
                {summary.baselineRemaining != null
                  ? formatHours(summary.baselineRemaining)
                  : "—"}
              </p>
              <p className="kpi-card-note">
                {summary.client.baselineHoursMonth != null
                  ? `de ${formatHours(summary.client.baselineHoursMonth)}/mês`
                  : "baseline não definido"}
              </p>
            </div>
            <div className="kpi-card">
              <span className="kpi-card-icon">◎</span>
              <p className="kpi-card-label">Uso do baseline</p>
              <p className="kpi-card-value">
                {baselinePct != null ? `${baselinePct}%` : "—"}
              </p>
              <p className="kpi-card-note">período atual</p>
            </div>
            <div className="kpi-card">
              <span className="kpi-card-icon">◴</span>
              <p className="kpi-card-label">Custo interno</p>
              <p className="kpi-card-value">
                {formatCents(summary.costCentsInternal)}
              </p>
              <p className="kpi-card-note">
                taxa {formatCents(summary.client.hourlyRateCents)}/h
              </p>
            </div>
          </section>

          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-section-head">
              <div>
                <h2>Consumo por consultor</h2>
                <p>Horas aprovadas que contam para baseline</p>
              </div>
            </div>
            {summary.byUser.length === 0 ? (
              <p className="empty">Nenhum lançamento no período.</p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Consultor</th>
                      <th>Horas</th>
                      <th>Custo interno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byUser.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.name}</td>
                        <td>{formatHours(row.seconds / 3600)}</td>
                        <td>{formatCents(row.costCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {isGestor && selectedClient ? (
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Parâmetros do cliente
          </h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Baseline mensal e taxa horária usada no cálculo de custo interno.
          </p>
          <form className="form" onSubmit={onSaveClientBilling}>
            <div className="field">
              <label htmlFor="baselineHours">Baseline (horas/mês)</label>
              <input
                id="baselineHours"
                type="text"
                inputMode="decimal"
                value={baselineHours}
                onChange={(e) => setBaselineHours(e.target.value)}
                placeholder="ex.: 40"
              />
            </div>
            <div className="field">
              <label htmlFor="hourlyRate">Taxa horária (R$)</label>
              <input
                id="hourlyRate"
                type="text"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="ex.: 150,00"
              />
            </div>
            <button className="btn" type="submit" disabled={savingClient}>
              {savingClient ? "Salvando…" : "Salvar parâmetros"}
            </button>
          </form>
        </div>
      ) : null}

      {isGestor && staffUsers.length > 0 ? (
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Fator hora por consultor
          </h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Multiplicador aplicado sobre a taxa do cliente no custo interno.
          </p>
          <ul className="ticket-list">
            {staffUsers.map((u) => (
              <li key={u.id} className="ticket-row">
                <div style={{ flex: 1 }}>
                  <div className="ticket-title">{u.name}</div>
                  <div className="ticket-meta">
                    {roleLabel(u.role)} · fator atual{" "}
                    {u.hourRateFactor ?? 1}
                  </div>
                </div>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = (
                      e.currentTarget.elements.namedItem(
                        "factor",
                      ) as HTMLInputElement
                    ).value;
                    void onSaveUserFactor(u, input);
                  }}
                >
                  <input
                    name="factor"
                    type="text"
                    inputMode="decimal"
                    className="inline-input"
                    defaultValue={String(u.hourRateFactor ?? 1)}
                    aria-label={`Fator hora de ${u.name}`}
                  />
                  <button
                    className="btn btn-sm"
                    type="submit"
                    disabled={savingUserId === u.id}
                  >
                    {savingUserId === u.id ? "…" : "Salvar"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
