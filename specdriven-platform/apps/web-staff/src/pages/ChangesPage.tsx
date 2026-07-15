import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listChanges,
  createChange,
  listProblems,
  type Change,
  type ChangeStatus,
  type Problem,
} from "../lib/api";

const STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Pendente Aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  implementing: "Em Execução",
  completed: "Concluída",
  failed: "Fracassada",
};

const STATUS_COLORS: Record<ChangeStatus, string> = {
  draft: "badge-gray",
  pending_approval: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
  implementing: "badge-blue",
  completed: "badge-success",
  failed: "badge-danger",
};

export function ChangesPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aba ativa: "list" ou "calendar"
  const [activeTab, setActiveTab] = useState<"list" | "calendar">("list");

  // Filtros para a lista
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Criação
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRiskScore, setNewRiskScore] = useState(1);
  const [newRollbackPlan, setNewRollbackPlan] = useState("");
  const [newWindowStart, setNewWindowStart] = useState("");
  const [newWindowEnd, setNewWindowEnd] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [creating, setCreating] = useState(false);

  // Navegação do Calendário
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date());

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [changesRes, probsRes] = await Promise.all([
        listChanges(),
        listProblems(),
      ]);
      setChanges(changesRes);
      setProblems(probsRes);
    } catch (err) {
      setError("Erro ao carregar dados de mudanças.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    try {
      await createChange({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        riskScore: Number(newRiskScore),
        rollbackPlan: newRollbackPlan.trim() || undefined,
        windowStart: newWindowStart ? new Date(newWindowStart).toISOString() : null,
        windowEnd: newWindowEnd ? new Date(newWindowEnd).toISOString() : null,
        problemId: newProblemId || null,
      });

      // Reset
      setNewTitle("");
      setNewDescription("");
      setNewRiskScore(1);
      setNewRollbackPlan("");
      setNewWindowStart("");
      setNewWindowEnd("");
      setNewProblemId("");
      setShowCreateForm(false);
      
      await loadData();
    } catch (err) {
      alert("Erro ao registrar a mudança.");
    } finally {
      setCreating(false);
    }
  }

  // Lógica do Calendário mensal
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Dom) a 6 (Sáb)
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells: (Date | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push(new Date(year, month, d));
  }

  const getChangesForDay = (date: Date) => {
    return changes.filter((c) => {
      if (!c.windowStart) return false;
      const start = new Date(c.windowStart);
      return (
        start.getDate() === date.getDate() &&
        start.getMonth() === date.getMonth() &&
        start.getFullYear() === date.getFullYear()
      );
    });
  };

  const nextMonth = () => {
    setCurrentCalendarDate(new Date(year, month + 1, 1));
  };

  const prevMonth = () => {
    setCurrentCalendarDate(new Date(year, month - 1, 1));
  };

  const filteredChanges = changes.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="container-lg">
      <div className="flex-head">
        <div>
          <h1>Mudanças (Changes)</h1>
          <p className="muted">Gerenciamento de mudanças e liberação segura (ITIL)</p>
        </div>
        <button
          className="btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancelar" : "Registrar Mudança"}
        </button>
      </div>

      {showCreateForm && (
        <div className="panel panel-spaced" style={{ marginTop: "1rem" }}>
          <div className="panel-head">
            <h2>Registrar Nova Solicitação de Mudança</h2>
          </div>
          <form onSubmit={handleCreate} className="form form-spaced">
            <div className="field">
              <label htmlFor="change-title">Título da Mudança *</label>
              <input
                id="change-title"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Atualização de pacotes de segurança no servidor web"
              />
            </div>
            <div className="field">
              <label htmlFor="change-desc">Descrição / Escopo da Mudança</label>
              <textarea
                id="change-desc"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descreva detalhadamente o que será alterado..."
              />
            </div>
            <div className="grid grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="field">
                <label htmlFor="change-risk">Score de Risco (1 a 5)</label>
                <select
                  id="change-risk"
                  value={newRiskScore}
                  onChange={(e) => setNewRiskScore(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((val) => (
                    <option key={val} value={val}>
                      Risco {val} {val === 1 ? "(Muito Baixo)" : val === 5 ? "(Muito Alto)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="change-problem">Problema de Origem (opcional)</label>
                <select
                  id="change-problem"
                  value={newProblemId}
                  onChange={(e) => setNewProblemId(e.target.value)}
                >
                  <option value="">Nenhum problema associado</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="change-rollback">Plano de Retorno (Rollback Plan)</label>
              <textarea
                id="change-rollback"
                rows={2}
                value={newRollbackPlan}
                onChange={(e) => setNewRollbackPlan(e.target.value)}
                placeholder="Como reverter esta mudança se houver falhas?"
              />
            </div>
            <div className="grid grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="field">
                <label htmlFor="change-start">Início da Janela (windowStart)</label>
                <input
                  id="change-start"
                  type="datetime-local"
                  value={newWindowStart}
                  onChange={(e) => setNewWindowStart(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="change-end">Fim da Janela (windowEnd)</label>
                <input
                  id="change-end"
                  type="datetime-local"
                  value={newWindowEnd}
                  onChange={(e) => setNewWindowEnd(e.target.value)}
                />
              </div>
            </div>
            <button className="btn" type="submit" disabled={creating}>
              {creating ? "Registrando..." : "Registrar Mudança"}
            </button>
          </form>
        </div>
      )}

      {/* Alternador de Abas */}
      <div className="tabs" style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "4px" }}>
        <button
          className={`tab-btn ${activeTab === "list" ? "active" : ""}`}
          onClick={() => setActiveTab("list")}
          style={{
            background: "none",
            border: "none",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontWeight: activeTab === "list" ? "bold" : "normal",
            borderBottom: activeTab === "list" ? "2px solid var(--accent)" : "none",
            color: activeTab === "list" ? "var(--text)" : "var(--text-muted)",
          }}
        >
          Visualização em Lista
        </button>
        <button
          className={`tab-btn ${activeTab === "calendar" ? "active" : ""}`}
          onClick={() => setActiveTab("calendar")}
          style={{
            background: "none",
            border: "none",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontWeight: activeTab === "calendar" ? "bold" : "normal",
            borderBottom: activeTab === "calendar" ? "2px solid var(--accent)" : "none",
            color: activeTab === "calendar" ? "var(--text)" : "var(--text-muted)",
          }}
        >
          Calendário de Janelas
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <span className="muted">Carregando mudanças...</span>
        </div>
      ) : activeTab === "list" ? (
        /* ABA LISTA */
        <div style={{ marginTop: "1rem" }}>
          <div className="panel" style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "center" }}>
            <label className="muted" style={{ fontWeight: "bold" }}>Filtrar Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: "250px" }}
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {filteredChanges.length === 0 ? (
            <div className="panel text-center" style={{ padding: "3rem" }}>
              <span style={{ fontSize: "2rem" }}>📅</span>
              <h3 style={{ margin: "1rem 0 0.5rem" }}>Nenhuma mudança encontrada</h3>
              <p className="muted" style={{ margin: 0 }}>
                Tente registrar uma nova mudança ou alterar o filtro de status.
              </p>
            </div>
          ) : (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Mudança</th>
                    <th>Status</th>
                    <th>Grau de Risco</th>
                    <th>Janela de Execução</th>
                    <th>Origem</th>
                    <th style={{ width: "80px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChanges.map((c) => {
                    const originProb = problems.find((p) => p.id === c.problemId);
                    return (
                      <tr key={c.id}>
                        <td>
                          <div>
                            <Link to={`/changes/${c.id}`} style={{ fontWeight: 600, color: "var(--accent)" }}>
                              {c.title}
                            </Link>
                            {c.description && (
                              <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                                {c.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_COLORS[c.status]}`}>
                            {STATUS_LABELS[c.status]}
                          </span>
                        </td>
                        <td>
                          <span className="muted" style={{ fontSize: "0.9rem" }}>
                            Risco {c.riskScore}/5
                          </span>
                        </td>
                        <td>
                          <span className="muted" style={{ fontSize: "0.85rem" }}>
                            {c.windowStart ? (
                              <>
                                {new Date(c.windowStart).toLocaleDateString("pt-BR")} às{" "}
                                {new Date(c.windowStart).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                              </>
                            ) : "Não agendada"}
                          </span>
                        </td>
                        <td>
                          {originProb ? (
                            <Link to={`/problems/${originProb.id}`} style={{ fontSize: "0.85rem", textDecoration: "underline" }}>
                              Problema #{originProb.id.slice(0, 8)}
                            </Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <Link to={`/changes/${c.id}`} className="btn btn-sm btn-ghost">
                            Detalhes
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ABA CALENDÁRIO */
        <div style={{ marginTop: "1rem" }}>
          <div className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <button className="btn btn-sm btn-ghost" onClick={prevMonth}>
              ← Mês Anterior
            </button>
            <h2 style={{ fontSize: "1.2rem", fontWeight: "bold", margin: 0 }}>
              {currentCalendarDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase()}
            </h2>
            <button className="btn btn-sm btn-ghost" onClick={nextMonth}>
              Próximo Mês →
            </button>
          </div>

          <div
            className="calendar-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            {/* Cabeçalho dias da semana */}
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div
                key={d}
                style={{
                  textAlign: "center",
                  padding: "0.75rem",
                  background: "var(--bg-soft)",
                  fontWeight: "bold",
                  borderBottom: "1px solid var(--border)",
                  borderRight: "1px solid var(--border)",
                }}
              >
                {d}
              </div>
            ))}

            {/* Células de dias */}
            {calendarCells.map((cell, idx) => {
              if (cell === null) {
                return (
                  <div
                    key={`empty-${idx}`}
                    style={{
                      background: "var(--bg-muted)",
                      opacity: 0.5,
                      minHeight: "100px",
                      borderBottom: "1px solid var(--border)",
                      borderRight: "1px solid var(--border)",
                    }}
                  />
                );
              }

              const dayChanges = getChangesForDay(cell);
              const isToday = new Date().toDateString() === cell.toDateString();

              return (
                <div
                  key={cell.toISOString()}
                  style={{
                    background: isToday ? "rgba(var(--accent-rgb), 0.05)" : "var(--bg)",
                    minHeight: "100px",
                    padding: "0.5rem",
                    borderBottom: "1px solid var(--border)",
                    borderRight: "1px solid var(--border)",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: isToday ? "bold" : "normal",
                      color: isToday ? "var(--accent)" : "var(--text)",
                      background: isToday ? "var(--bg-soft)" : "transparent",
                      borderRadius: "50%",
                      padding: "2px 6px",
                      display: "inline-block",
                      marginBottom: "4px",
                    }}
                  >
                    {cell.getDate()}
                  </span>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {dayChanges.map((change) => (
                      <Link
                        key={change.id}
                        to={`/changes/${change.id}`}
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          background: change.status === "approved" ? "#22c55e" : change.status === "pending_approval" ? "#eab308" : "#9ca3af",
                          color: "white",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "block",
                          textDecoration: "none",
                          fontWeight: "500",
                        }}
                        title={`${change.title} (${STATUS_LABELS[change.status]})`}
                      >
                        {change.title}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
