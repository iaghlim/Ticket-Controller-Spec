import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Client, User } from "@specdriven/shared";
import {
  ApiError,
  getBillingSummary,
  listClients,
  listUsers,
  patchClientBilling,
  patchProjectBilling,
  patchUserBilling,
  patchUserProjectBilling,
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
  const [projectId, setProjectId] = useState("");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingUserProjKey, setSavingUserProjKey] = useState<string | null>(null);

  const [clientBaselineHours, setClientBaselineHours] = useState("");
  const [clientHourlyRate, setClientHourlyRate] = useState("");

  const [projectFormState, setProjectFormState] = useState<
    Record<string, { baseline: string; rate: string }>
  >({});

  const [userProjFactors, setUserProjFactors] = useState<Record<string, string>>({});

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

  const loadSummary = useCallback(async (cId: string, pId?: string) => {
    if (!cId) {
      setSummary(null);
      return;
    }
    setLoadingSummary(true);
    setError(null);
    try {
      const { from, to } = monthRange();
      const res = await getBillingSummary(cId, from, to, pId || undefined);
      setSummary(res);

      setClientBaselineHours(
        res.client.baselineHoursMonth != null
          ? String(res.client.baselineHoursMonth)
          : "",
      );
      setClientHourlyRate(
        res.client.hourlyRateCents != null
          ? String(res.client.hourlyRateCents / 100)
          : "",
      );

      if (res.projects) {
        const pMap: Record<string, { baseline: string; rate: string }> = {};
        const upMap: Record<string, string> = {};
        for (const p of res.projects) {
          pMap[p.id] = {
            baseline: p.baselineHoursMonth != null ? String(p.baselineHoursMonth) : "",
            rate: p.hourlyRateCents != null ? String(p.hourlyRateCents / 100) : "",
          };
          for (const link of p.userLinks) {
            upMap[`${p.id}_${link.userId}`] =
              link.hourRateFactor != null ? String(link.hourRateFactor) : "";
          }
        }
        setProjectFormState(pMap);
        setUserProjFactors(upMap);
      }
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
    if (clientId) {
      setProjectId("");
      void loadSummary(clientId);
    }
  }, [clientId, loadSummary]);

  const handleProjectFilterChange = (newProjId: string) => {
    setProjectId(newProjId);
    if (clientId) {
      void loadSummary(clientId, newProjId);
    }
  };

  async function onSaveClientBilling(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !isGestor) return;
    setSavingClient(true);
    setError(null);
    setOk(null);
    try {
      const baselineVal = clientBaselineHours.trim()
        ? Number(clientBaselineHours.replace(",", "."))
        : null;
      const rateVal = clientHourlyRate.trim()
        ? Math.round(Number(clientHourlyRate.replace(",", ".")) * 100)
        : null;
      await patchClientBilling(clientId, {
        baselineHoursMonth: baselineVal,
        hourlyRateCents: rateVal,
      });
      setOk("Parâmetros do cliente aplicados a todos os projetos.");
      await loadSummary(clientId, projectId);
      await loadClients();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar baseline.",
      );
    } finally {
      setSavingClient(false);
    }
  }

  async function onSaveProjectBilling(pId: string) {
    if (!isGestor || !pId) return;
    const current = projectFormState[pId];
    if (!current) return;
    setSavingProjectId(pId);
    setError(null);
    setOk(null);
    try {
      const baselineVal = current.baseline.trim()
        ? Number(current.baseline.replace(",", "."))
        : null;
      const rateVal = current.rate.trim()
        ? Math.round(Number(current.rate.replace(",", ".")) * 100)
        : null;
      await patchProjectBilling(pId, {
        baselineHoursMonth: baselineVal,
        hourlyRateCents: rateVal,
      });
      setOk("Parâmetros do projeto atualizados com sucesso.");
      await loadSummary(clientId, projectId);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar parâmetros do projeto.",
      );
    } finally {
      setSavingProjectId(null);
    }
  }

  async function onSaveUserFactor(u: User, factorStr: string) {
    if (!isGestor) return;
    const val = Number(factorStr.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) return;
    setSavingUserId(u.id);
    setError(null);
    setOk(null);
    try {
      await patchUserBilling(u.id, val);
      setOk(`Fator hora geral de ${u.name} atualizado.`);
      if (clientId) await loadSummary(clientId, projectId);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar fator hora geral.",
      );
    } finally {
      setSavingUserId(null);
    }
  }

  async function onSaveUserProjectFactor(pId: string, uId: string, uName: string) {
    if (!isGestor) return;
    const key = `${pId}_${uId}`;
    const rawVal = userProjFactors[key]?.trim();
    const val = rawVal ? Number(rawVal.replace(",", ".")) : null;
    if (val !== null && (!Number.isFinite(val) || val <= 0)) return;

    setSavingUserProjKey(key);
    setError(null);
    setOk(null);
    try {
      await patchUserProjectBilling(pId, uId, val);
      setOk(
        val != null
          ? `Fator hora do consultor ${uName} para o projeto atualizado.`
          : `Fator hora do consultor ${uName} resetado para o padrão geral.`,
      );
      if (clientId) await loadSummary(clientId, projectId);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao salvar fator hora por projeto.",
      );
    } finally {
      setSavingUserProjKey(null);
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
          <h1 className="page-title-serif">Baseline e Faturamento.</h1>
          <p>
            Consumo de horas aprovadas, parâmetros de projetos e custo interno por consultor · {monthLabel()}
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}

      {/* Selectors */}
      <div className="panel" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className="field" style={{ flex: 1, minWidth: 240, margin: 0 }}>
          <label htmlFor="billingClient">Cliente</label>
          <select
            id="billingClient"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={loading || clients.length === 0}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.code ? `(${c.code})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ flex: 1, minWidth: 240, margin: 0 }}>
          <label htmlFor="billingProject">Filtrar por Projeto</label>
          <select
            id="billingProject"
            value={projectId}
            onChange={(e) => handleProjectFilterChange(e.target.value)}
            disabled={loadingSummary || !summary?.projects || summary.projects.length === 0}
          >
            <option value="">— Todos os Projetos do Cliente —</option>
            {summary?.projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} [{p.code}]
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
                taxa média {formatCents(summary.client.hourlyRateCents)}/h
              </p>
            </div>
          </section>

          <div className="panel" style={{ padding: 0 }}>
            <div className="panel-section-head">
              <div>
                <h2>Consumo por consultor</h2>
                <p>Horas aprovadas que contam para baseline no período</p>
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
                        <td style={{ fontWeight: 500 }}>{row.name}</td>
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

      {/* Project & Client Parameters */}
      {isGestor && selectedClient ? (
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Parâmetros de Baseline e Taxa Horária por Projeto
          </h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem", marginBottom: "1.25rem" }}>
            Defina o baseline mensal de horas e a taxa horária de faturamento/custo para cada projeto individualmente.
          </p>

          {summary?.projects && summary.projects.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "1.5rem" }}>
              {summary.projects.map((p) => {
                const state = projectFormState[p.id] || { baseline: "", rate: "" };

                return (
                  <div
                    key={p.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "1rem",
                      background: "var(--surface)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                      <div>
                        <strong>{p.name}</strong>{" "}
                        <code className="mono" style={{ fontSize: "0.78rem", opacity: 0.7 }}>[{p.code}]</code>
                      </div>
                      <span className="badge badge-em_andamento" style={{ fontSize: "0.75rem" }}>
                        {p.baselineHoursMonth ? `${p.baselineHoursMonth}h/mês` : "Sem baseline"} · {p.hourlyRateCents ? `${formatCents(p.hourlyRateCents)}/h` : "Sem taxa"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
                        <label htmlFor={`baseline-${p.id}`} style={{ fontSize: "0.8rem" }}>Baseline (horas/mês)</label>
                        <input
                          id={`baseline-${p.id}`}
                          type="text"
                          inputMode="decimal"
                          value={state.baseline}
                          onChange={(e) =>
                            setProjectFormState((prev) => ({
                              ...prev,
                              [p.id]: { ...prev[p.id]!, baseline: e.target.value },
                            }))
                          }
                          placeholder="ex.: 40"
                          style={{ fontSize: "0.85rem" }}
                        />
                      </div>
                      <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
                        <label htmlFor={`rate-${p.id}`} style={{ fontSize: "0.8rem" }}>Taxa Horária (R$)</label>
                        <input
                          id={`rate-${p.id}`}
                          type="text"
                          inputMode="decimal"
                          value={state.rate}
                          onChange={(e) =>
                            setProjectFormState((prev) => ({
                              ...prev,
                              [p.id]: { ...prev[p.id]!, rate: e.target.value },
                            }))
                          }
                          placeholder="ex.: 150,00"
                          style={{ fontSize: "0.85rem" }}
                        />
                      </div>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={savingProjectId === p.id}
                        onClick={() => void onSaveProjectBilling(p.id)}
                      >
                        {savingProjectId === p.id ? "Salvando…" : "Salvar Projeto"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
              Nenhum projeto cadastrado para este cliente.
            </p>
          )}

          <details style={{ marginTop: "1rem", borderTop: "1px dashed var(--border)", paddingTop: "0.75rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "var(--primary)" }}>
              ⚡ Aplicar parâmetros em lote a TODOS os projetos do cliente ({selectedClient.name})
            </summary>
            <form className="form" onSubmit={onSaveClientBilling} style={{ marginTop: "0.75rem" }}>
              <div className="field">
                <label htmlFor="baselineHours">Baseline padrão (horas/mês)</label>
                <input
                  id="baselineHours"
                  type="text"
                  inputMode="decimal"
                  value={clientBaselineHours}
                  onChange={(e) => setClientBaselineHours(e.target.value)}
                  placeholder="ex.: 40"
                />
              </div>
              <div className="field">
                <label htmlFor="hourlyRate">Taxa horária padrão (R$)</label>
                <input
                  id="hourlyRate"
                  type="text"
                  inputMode="decimal"
                  value={clientHourlyRate}
                  onChange={(e) => setClientHourlyRate(e.target.value)}
                  placeholder="ex.: 150,00"
                />
              </div>
              <button className="btn btn-ghost" type="submit" disabled={savingClient}>
                {savingClient ? "Salvando…" : "Aplicar a todos os projetos"}
              </button>
            </form>
          </details>
        </div>
      ) : null}

      {/* Consultant Rate Factor: Global & Per Project */}
      {isGestor ? (
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Fator Hora por Consultor (Geral e por Projeto)
          </h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem", marginBottom: "1rem" }}>
            Multiplicador aplicado sobre a taxa horária no cálculo do custo interno. Pode ser definido globalmente ou especificamente por projeto.
          </p>

          {/* Fator Hora por Projeto */}
          {summary?.projects && summary.projects.length > 0 ? (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.5rem" }}>
                1. Fator Hora Específico por Projeto ({selectedClient?.name})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {summary.projects.map((p) => {
                  if (p.userLinks.length === 0) return null;

                  return (
                    <div
                      key={p.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.75rem 0.85rem",
                        background: "var(--surface)",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                        Projeto [{p.code}] {p.name}
                      </div>

                      <ul className="ticket-list" style={{ margin: 0 }}>
                        {p.userLinks.map((link) => {
                          const key = `${p.id}_${link.userId}`;
                          const isSaving = savingUserProjKey === key;
                          const currentVal = userProjFactors[key] ?? "";

                          return (
                            <li key={link.id} className="ticket-row" style={{ padding: "0.4rem 0" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>{link.userName}</div>
                                <div className="ticket-meta" style={{ fontSize: "0.75rem" }}>
                                  {roleLabel(link.userRole as any)} · {link.hourRateFactor != null ? `fator projeto: ${link.hourRateFactor}` : "usando fator geral"}
                                </div>
                              </div>
                              <form
                                className="inline-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void onSaveUserProjectFactor(p.id, link.userId, link.userName);
                                }}
                              >
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="inline-input"
                                  style={{ width: "65px", fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
                                  value={currentVal}
                                  onChange={(e) =>
                                    setUserProjFactors((prev) => ({
                                      ...prev,
                                      [key]: e.target.value,
                                    }))
                                  }
                                  placeholder="Geral"
                                  aria-label={`Fator hora no projeto de ${link.userName}`}
                                />
                                <button className="btn btn-sm" type="submit" disabled={isSaving}>
                                  {isSaving ? "…" : "Salvar"}
                                </button>
                              </form>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Fator Hora Geral */}
          {staffUsers.length > 0 ? (
            <div>
              <h3 style={{ fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.5rem" }}>
                2. Fator Hora Geral da Equipe (Global)
              </h3>
              <ul className="ticket-list">
                {staffUsers.map((u) => (
                  <li key={u.id} className="ticket-row">
                    <div style={{ flex: 1 }}>
                      <div className="ticket-title">{u.name}</div>
                      <div className="ticket-meta">
                        {roleLabel(u.role)} · fator padrão global{" "}
                        <strong>{u.hourRateFactor ?? 1}</strong>
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
                        aria-label={`Fator hora geral de ${u.name}`}
                      />
                      <button
                        className="btn btn-sm"
                        type="submit"
                        disabled={savingUserId === u.id}
                      >
                        {savingUserId === u.id ? "…" : "Salvar Geral"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
