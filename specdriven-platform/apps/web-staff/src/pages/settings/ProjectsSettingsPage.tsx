import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Client, Project, User } from "@specdriven/shared";
import {
  ApiError,
  createProject,
  updateProject,
  listClients,
  listProjects,
  listModules,
  listUsers,
  listProjectAssignments,
  createProjectAssignment,
  deleteProjectAssignment,
  type ProjectModuleAssignment,
  type SupportTier,
  type TicketModuleCatalogItem,
} from "../../lib/api";
import { formatDate } from "../../lib/labels";

export function ProjectsSettingsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [billingModel, setBillingModel] = useState<"per_hour" | "per_ticket" | "fixed_project">("per_hour");
  const [baselineHoursMonth, setBaselineHoursMonth] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [ticketRate, setTicketRate] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Assignments & Catalog State
  const [modules, setModules] = useState<TicketModuleCatalogItem[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<ProjectModuleAssignment[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProjects = useCallback(async (selectedClientId: string) => {
    if (!selectedClientId) {
      setProjects([]);
      return;
    }
    try {
      const res = await listProjects(selectedClientId);
      setProjects(res.projects);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar projetos.",
      );
    }
  }, []);

  const loadModulesAndStaff = useCallback(async () => {
    try {
      const [modRes, userRes] = await Promise.all([
        listModules(),
        listUsers(["gestor", "consultor"]),
      ]);
      setModules(modRes.modules);
      setStaffUsers(userRes.users);
    } catch (err) {
      console.error("Erro ao carregar modulos/usuarios:", err);
    }
  }, []);

  const loadAssignments = useCallback(async (projId: string) => {
    try {
      const res = await listProjectAssignments(projId);
      setAssignments(res.assignments);
    } catch (err) {
      console.error("Erro ao carregar assignments:", err);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadModulesAndStaff();
      const res = await listClients();
      setClients(res.clients);
      const first = res.clients[0]?.id ?? "";
      setClientId((prev) => {
        const selected = prev || first;
        if (selected) void loadProjects(selected);
        return selected;
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar clientes.",
      );
    } finally {
      setLoading(false);
    }
  }, [loadProjects, loadModulesAndStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (clientId) {
      void loadProjects(clientId);
      setSelectedProject(null);
      clearForm();
    }
  }, [clientId, loadProjects]);

  // Load assignments when selected project changes
  useEffect(() => {
    if (selectedProject) {
      void loadAssignments(selectedProject.id);
    } else {
      setAssignments([]);
    }
  }, [selectedProject, loadAssignments]);

  const selectProjectForEdit = (proj: Project) => {
    setSelectedProject(proj);
    setName(proj.name);
    setCode(proj.code);
    setBillingModel(proj.billingModel as any);
    setBaselineHoursMonth(proj.baselineHoursMonth?.toString() ?? "");
    setHourlyRate(proj.hourlyRateCents ? (proj.hourlyRateCents / 100).toString() : "");
    setTicketRate(proj.ticketRateCents ? (proj.ticketRateCents / 100).toString() : "");
    setBudget(proj.budgetCents ? (proj.budgetCents / 100).toString() : "");
    setStartDate(proj.startDate ? new Date(proj.startDate).toISOString().split("T")[0] : "");
    setEndDate(proj.endDate ? new Date(proj.endDate).toISOString().split("T")[0] : "");
    setError(null);
    setOk(null);
  };

  const clearForm = () => {
    setSelectedProject(null);
    setName("");
    setCode("");
    setBillingModel("per_hour");
    setBaselineHoursMonth("");
    setHourlyRate("");
    setTicketRate("");
    setBudget("");
    setStartDate("");
    setEndDate("");
    setError(null);
    setOk(null);
  };

  const handleAddAssignment = async (moduleKey: string, tier: SupportTier, userId: string) => {
    if (!selectedProject) return;
    try {
      setError(null);
      const res = await createProjectAssignment(selectedProject.id, {
        module: moduleKey,
        userId,
        tier,
      });
      setAssignments((prev) => [res.assignment, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao vincular usuário.");
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!selectedProject) return;
    try {
      setError(null);
      await deleteProjectAssignment(selectedProject.id, assignmentId);
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao desvincular usuário.");
    }
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !name.trim() || !code.trim()) return;

    setSaving(true);
    setError(null);
    setOk(null);

    const payload = {
      clientId,
      name: name.trim(),
      code: code.trim(),
      billingModel,
      baselineHoursMonth: baselineHoursMonth ? parseFloat(baselineHoursMonth) : null,
      hourlyRateCents: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : null,
      ticketRateCents: ticketRate ? Math.round(parseFloat(ticketRate) * 100) : null,
      budgetCents: budget ? Math.round(parseFloat(budget) * 100) : null,
      startDate: startDate ? new Date(startDate).toISOString() : null,
      endDate: endDate ? new Date(endDate).toISOString() : null,
    };

    try {
      if (selectedProject) {
        // Edit Mode
        const { project } = await updateProject(selectedProject.id, payload);
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? project : p)).sort((a, b) => a.name.localeCompare(b.name)),
        );
        setSelectedProject(project);
        setOk("Projeto atualizado com sucesso.");
      } else {
        // Create Mode
        const { project } = await createProject(payload);
        setProjects((prev) =>
          [...prev, project].sort((a, b) => a.name.localeCompare(b.name)),
        );
        clearForm();
        setOk("Projeto criado com sucesso.");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar projeto.",
      );
    } finally {
      setSaving(false);
    }
  }

  const renderFinancialFields = () => {
    switch (billingModel) {
      case "per_hour":
        return (
          <div className="grid-2">
            <label className="field">
              <span>Taxa Hora (R$)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Ex.: 150.00"
              />
            </label>
            <label className="field">
              <span>Baseline de Horas/Mês</span>
              <input
                type="number"
                step="1"
                min="0"
                value={baselineHoursMonth}
                onChange={(e) => setBaselineHoursMonth(e.target.value)}
                placeholder="Ex.: 40"
              />
            </label>
          </div>
        );
      case "per_ticket":
        return (
          <label className="field">
            <span>Valor por Chamado/Ticket (R$)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={ticketRate}
              onChange={(e) => setTicketRate(e.target.value)}
              placeholder="Ex.: 250.00"
            />
          </label>
        );
      case "fixed_project":
        return (
          <div className="grid-2">
            <label className="field">
              <span>Orçamento Global do Projeto (R$)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Ex.: 15000.00"
              />
            </label>
            <label className="field">
              <span>Taxa Hora para Horas Extras (R$)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="Ex.: 120.00"
              />
            </label>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return <p className="muted">Carregando projetos…</p>;
  }

  return (
    <div>
      <div className="panel-head">
        <h2>Projetos & Direcionamento</h2>
        <p>
          Gerencie os projetos dos clientes, modelos de faturamento e o pool de direcionamento de especialistas por módulo.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-text">{ok}</p> : null}

      <div className="panel">
        <label className="field">
          <span>Cliente</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={clients.length === 0}
          >
            {clients.length === 0 ? (
              <option value="">Nenhum cliente cadastrado</option>
            ) : (
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.code ? ` (${c.code})` : ""}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }}>
        {/* Left Column: Projects list */}
        <div className="panel" style={{ padding: 0 }}>
          <div className="panel-section-head">
            <div>
              <h3>Projetos do cliente</h3>
              <p>{projects.length} projeto(s)</p>
            </div>
          </div>
          {projects.length === 0 ? (
            <p className="empty" style={{ padding: "1rem" }}>Nenhum projeto cadastrado para este cliente.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Código</th>
                    <th>Faturamento</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        cursor: "pointer",
                        background: selectedProject?.id === p.id ? "var(--bg-muted)" : undefined,
                      }}
                      onClick={() => selectProjectForEdit(p)}
                    >
                      <td>
                        <span style={{ fontWeight: selectedProject?.id === p.id ? "bold" : "normal" }}>
                          {p.name}
                        </span>
                      </td>
                      <td className="table-meta mono">{p.code ?? "—"}</td>
                      <td className="table-meta">
                        {p.billingModel === "per_hour"
                          ? "Hora (T&M)"
                          : p.billingModel === "per_ticket"
                          ? "Por Ticket"
                          : "Preço Fixo"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectProjectForEdit(p);
                          }}
                        >
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Project details / Edit Form */}
        <div>
          {clientId ? (
            <form className="panel" onSubmit={(e) => void onSubmit(e)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>
                  {selectedProject ? "Editar Projeto" : "Novo Projeto"}
                </h3>
                {selectedProject ? (
                  <button type="button" className="btn-link" onClick={clearForm}>
                    Criar Novo
                  </button>
                ) : null}
              </div>

              <div className="grid-2">
                <label className="field">
                  <span>Nome do Projeto *</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="Ex.: Implantação ERP"
                  />
                </label>
                <label className="field">
                  <span>Código do Projeto *</span>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={32}
                    placeholder="impl-erp"
                    className="mono"
                  />
                </label>
              </div>

              <label className="field">
                <span>Modelo de Faturamento</span>
                <select
                  value={billingModel}
                  onChange={(e) => setBillingModel(e.target.value as any)}
                >
                  <option value="per_hour">Time & Materials (Por Hora)</option>
                  <option value="per_ticket">Ticket Based (Por Chamado)</option>
                  <option value="fixed_project">Fixed Price (Preço Fixo)</option>
                </select>
              </label>

              {renderFinancialFields()}

              <div className="grid-2">
                <label className="field">
                  <span>Início do Contrato</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Término do Contrato</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? "Salvando…" : selectedProject ? "Salvar Alterações" : "Criar Projeto"}
                </button>
                {selectedProject ? (
                  <button type="button" className="btn btn-muted" onClick={clearForm} style={{ marginLeft: "0.5rem" }}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>
      </div>

      {/* Full Width Row: Pool de Direcionamento */}
      {selectedProject ? (
        <div className="panel" style={{ marginTop: "2rem" }}>
          <div className="panel-section-head">
            <div>
              <h3>Pool de Direcionamento: {selectedProject.name}</h3>
              <p>Atribua especialistas de suporte nos níveis N1, N2 e N3 para cada módulo deste projeto.</p>
            </div>
          </div>

          {modules.length === 0 ? (
            <p className="empty">Nenhum módulo disponível no catálogo geral. Ative os módulos nas configurações.</p>
          ) : (
            <div className="data-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: "20%" }}>Módulo</th>
                    <th style={{ width: "26%" }}>Nível N1 (Suporte Inicial)</th>
                    <th style={{ width: "26%" }}>Nível N2 (Especialista)</th>
                    <th style={{ width: "26%" }}>Nível N3 (Líder/Dev)</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((mod) => (
                    <tr key={mod.id}>
                      <td style={{ fontWeight: "600" }}>
                        <div>{mod.label}</div>
                        <small className="mono text-muted" style={{ fontSize: "10px" }}>{mod.key}</small>
                      </td>
                      {(["N1", "N2", "N3"] as SupportTier[]).map((tier) => {
                        const tierAss = assignments.filter(
                          (a) => a.module === mod.key && a.tier === tier,
                        );
                        return (
                          <td key={tier} style={{ verticalAlign: "top" }}>
                            {/* Assigned users badges */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
                              {tierAss.map((a) => (
                                <span
                                  key={a.id}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    padding: "2px 6px",
                                    background: "var(--bg-muted)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                  }}
                                >
                                  <span>{a.user?.name ?? "Consultor"}</span>
                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveAssignment(a.id)}
                                    style={{
                                      border: "none",
                                      background: "transparent",
                                      color: "var(--primary)",
                                      cursor: "pointer",
                                      fontWeight: "bold",
                                      padding: "0 2px",
                                      fontSize: "11px",
                                    }}
                                    title="Remover especialista"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>

                            {/* User Selector Dropdown (Autocomplete substitute) */}
                            <select
                              value=""
                              onChange={(e) => {
                                const uid = e.target.value;
                                if (uid) void handleAddAssignment(mod.key, tier, uid);
                              }}
                              style={{
                                fontSize: "11px",
                                padding: "2px 4px",
                                width: "100%",
                                borderRadius: "4px",
                                border: "1px solid var(--border)",
                                background: "var(--bg-elevated)",
                              }}
                            >
                              <option value="">+ Vincular consultor...</option>
                              {staffUsers
                                .filter((u) => !tierAss.some((a) => a.userId === u.id))
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({u.role})
                                  </option>
                                ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    
      {/* User-Project Linking Section */}
      {selectedProject ? (
        <div className="panel" style={{ marginTop: "2rem" }}>
          <div className="panel-section-head">
            <div>
              <h3>Usuários vinculados ao projeto: {selectedProject.name}</h3>
              <p>Vincule clientes e consultores a este projeto. Usuários sem vínculo veem todos os projetos do cliente; com vínculo, veem apenas os projetos vinculados.</p>
            </div>
          </div>
          <UserProjectManager projectId={selectedProject.id} />
        </div>
      ) : null}
function UserProjectManager({ projectId }: { projectId: string }) {
  const [links, setLinks] = useState<Array<{ id: string; user: { id: string; name: string; email: string; role: string; clientId: string | null }; active: boolean }>>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      const res = await listUserProjects();
      // Filter for this project
      setLinks(res.links.filter((l) => l.projectId === projectId && l.active && l.user) as any);
    } catch { /* ignore */ }
  }, [projectId]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await listUsers();
      setUsers(res.users);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadLinks(), loadUsers()]).finally(() => setLoading(false));
  }, [loadLinks, loadUsers]);

  async function handleLink(userId: string) {
    try {
      setError(null);
      const res = await linkUserToProject(projectId, userId);
      setLinks((prev: any) => [...prev.filter((l: any) => l.user.id !== userId), res.link]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao vincular usuário.");
    }
  }

  async function handleUnlink(userId: string) {
    try {
      setError(null);
      await unlinkUserFromProject(projectId, userId);
      setLinks((prev: any) => prev.filter((l: any) => l.user.id !== userId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao remover vínculo.");
    }
  }

  if (loading) return <p className="muted">Carregando vínculos…</p>;

  const linkedUserIds = new Set(links.map((l) => l.user.id));
  const availableUsers = users.filter((u) => !linkedUserIds.has(u.id));

  return (
    <div>
      {error ? <p className="error">{error}</p> : null}

      <div className="data-table-wrap" style={{ marginTop: "1rem" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Cliente</th>
              <th style={{ width: "80px" }}></th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">Nenhum usuário vinculado. Use o dropdown abaixo.</td>
              </tr>
            ) : (
              links.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontWeight: "500" }}>{l.user.name}</td>
                  <td className="mono table-meta">{l.user.email}</td>
                  <td className="table-meta">{roleLabel(l.user.role)}</td>
                  <td className="table-meta">
                    {l.user.clientId
                      ? clients.find((c) => c.id === l.user.clientId)?.name ?? l.user.clientId
                      : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ color: "var(--danger, #c00)", padding: "2px 8px", fontSize: "0.75rem" }}
                      onClick={() => void handleUnlink(l.user.id)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {availableUsers.length > 0 ? (
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            id="linkUser"
            defaultValue=""
            onChange={(e) => { const uid = e.target.value; if (uid) void handleLink(uid); e.target.value = ""; }}
            style={{ flex: 1, padding: "0.4rem", borderRadius: "4px", border: "1px solid var(--border)" }}
          >
            <option value="">+ Vincular usuário ao projeto...</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email}) — {roleLabel(u.role)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
          Todos os usuários já estão vinculados a este projeto.
        </p>
      )}
    </div>
  );
}</div>
  );
}
