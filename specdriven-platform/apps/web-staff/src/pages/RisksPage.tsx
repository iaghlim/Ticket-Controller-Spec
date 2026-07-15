import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listRisks,
  createRisk,
  listProblems,
  listChanges,
  type Risk,
  type Problem,
  type Change,
} from "../lib/api";

const PROBABILITY_LABELS: Record<number, string> = {
  5: "5 - Quase Certo",
  4: "4 - Provável",
  3: "3 - Possível",
  2: "2 - Pouco Provável",
  1: "1 - Raro",
};

const IMPACT_LABELS: Record<number, string> = {
  1: "1 - Muito Baixo",
  2: "2 - Baixo",
  3: "3 - Médio",
  4: "4 - Alto",
  5: "5 - Crítico",
};

const STATUS_LABELS: Record<Risk["status"], string> = {
  open: "Aberto",
  mitigated: "Mitigado",
  avoided: "Evitado",
  transferred: "Transferido",
  accepted: "Aceito",
};

const STATUS_COLORS: Record<Risk["status"], string> = {
  open: "badge-danger",
  mitigated: "badge-success",
  avoided: "badge-blue",
  transferred: "badge-warning",
  accepted: "badge-gray",
};

export function RisksPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de seleção na matriz
  const [selectedCell, setSelectedCell] = useState<{ prob: number; imp: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Criação
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newProbability, setNewProbability] = useState<number>(3);
  const [newImpact, setNewImpact] = useState<number>(3);
  const [newStatus, setNewStatus] = useState<Risk["status"]>("open");
  const [newMitigationPlan, setNewMitigationPlan] = useState("");
  const [newProblemId, setNewProblemId] = useState("");
  const [newChangeId, setNewChangeId] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [risksRes, problemsRes, changesRes] = await Promise.all([
        listRisks(),
        listProblems(),
        listChanges(),
      ]);
      setRisks(risksRes);
      setProblems(problemsRes);
      setChanges(changesRes);
    } catch (err) {
      setError("Erro ao carregar dados de riscos.");
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
      await createRisk({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        probability: newProbability,
        impact: newImpact,
        status: newStatus,
        mitigationPlan: newMitigationPlan.trim() || undefined,
        problemId: newProblemId || null,
        changeId: newChangeId || null,
      });
      setNewTitle("");
      setNewDescription("");
      setNewProbability(3);
      setNewImpact(3);
      setNewStatus("open");
      setNewMitigationPlan("");
      setNewProblemId("");
      setNewChangeId("");
      setShowCreateForm(false);
      await loadData();
    } catch (err) {
      alert("Erro ao criar o risco.");
    } finally {
      setCreating(false);
    }
  }

  // Filtragem dos riscos exibidos na tabela
  const filteredRisks = risks.filter((r) => {
    if (selectedCell) {
      if (r.probability !== selectedCell.prob || r.impact !== selectedCell.imp) {
        return false;
      }
    }
    if (statusFilter && r.status !== statusFilter) {
      return false;
    }
    return true;
  });

  // Helper para obter nível do risco
  function getRiskLevel(prob: number, imp: number): { label: string; bg: string; text: string; score: number } {
    const score = prob * imp;
    if (score >= 15) return { label: "Crítico", bg: "#fee2e2", text: "#991b1b", score };
    if (score >= 10) return { label: "Alto", bg: "#ffedd5", text: "#9a3412", score };
    if (score >= 5) return { label: "Médio", bg: "#fef9c3", text: "#854d0e", score };
    return { label: "Baixo", bg: "#dcfce7", text: "#166534", score };
  }

  // Contagem de riscos por célula (prob x imp)
  const cellCounts: Record<string, number> = {};
  for (let p = 1; p <= 5; p++) {
    for (let i = 1; i <= 5; i++) {
      cellCounts[`${p}-${i}`] = 0;
    }
  }
  risks.forEach((r) => {
    cellCounts[`${r.probability}-${r.impact}`] = (cellCounts[`${r.probability}-${r.impact}`] || 0) + 1;
  });

  return (
    <div className="container-lg">
      <div className="flex-head">
        <div>
          <h1>Matriz de Riscos (ITIL)</h1>
          <p className="muted">Identificação, avaliação qualitativa e mitigação de riscos operacionais</p>
        </div>
        <button
          className="btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancelar" : "Novo Risco"}
        </button>
      </div>

      {showCreateForm && (
        <div className="panel panel-spaced" style={{ marginTop: "1rem" }}>
          <div className="panel-head">
            <h2>Registrar Novo Risco</h2>
          </div>
          <form onSubmit={handleCreate} className="form form-spaced">
            <div className="field">
              <label htmlFor="risk-title">Título do Risco *</label>
              <input
                id="risk-title"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Falha de conectividade no link principal"
              />
            </div>
            <div className="field">
              <label htmlFor="risk-desc">Descrição / Detalhes</label>
              <textarea
                id="risk-desc"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Explique o risco e suas potenciais consequências..."
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div className="field">
                <label htmlFor="risk-prob">Probabilidade (1 a 5) *</label>
                <select
                  id="risk-prob"
                  value={newProbability}
                  onChange={(e) => setNewProbability(Number(e.target.value))}
                >
                  {Object.entries(PROBABILITY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="risk-imp">Impacto (1 a 5) *</label>
                <select
                  id="risk-imp"
                  value={newImpact}
                  onChange={(e) => setNewImpact(Number(e.target.value))}
                >
                  {Object.entries(IMPACT_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="risk-status">Status *</label>
                <select
                  id="risk-status"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as Risk["status"])}
                >
                  {Object.entries(STATUS_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="risk-plan">Plano de Mitigação / Contingência</label>
              <textarea
                id="risk-plan"
                rows={2}
                value={newMitigationPlan}
                onChange={(e) => setNewMitigationPlan(e.target.value)}
                placeholder="Ações para reduzir a probabilidade ou o impacto deste risco..."
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="field">
                <label htmlFor="risk-problem">Problema Vinculado (Opcional)</label>
                <select
                  id="risk-problem"
                  value={newProblemId}
                  onChange={(e) => setNewProblemId(e.target.value)}
                >
                  <option value="">Nenhum problema</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="risk-change">Mudança Vinculada (Opcional)</label>
                <select
                  id="risk-change"
                  value={newChangeId}
                  onChange={(e) => setNewChangeId(e.target.value)}
                >
                  <option value="">Nenhuma mudança</option>
                  {changes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button className="btn" type="submit" disabled={creating}>
              {creating ? "Registrando..." : "Registrar Risco"}
            </button>
          </form>
        </div>
      )}

      {/* Heatmap/Matrix Section */}
      <div className="panel panel-spaced" style={{ marginTop: "1rem" }}>
        <div className="panel-head">
          <h2>Matriz de Probabilidade x Impacto</h2>
          <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
            Clique em uma célula para filtrar os riscos abaixo correspondentes.
          </p>
        </div>

        <div style={{ overflowX: "auto", padding: "1rem 0" }}>
          <div style={{ minWidth: "600px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Top axis label */}
            <div style={{ fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              IMPACTO
            </div>

            {/* Matrix grid wrapper */}
            <div style={{ display: "flex", gap: "1rem", width: "100%", justifyContent: "center" }}>
              {/* Left axis label */}
              <div style={{
                writingMode: "vertical-lr",
                transform: "rotate(180deg)",
                fontWeight: "bold",
                fontSize: "0.9rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                PROBABILIDADE
              </div>

              {/* Main matrix */}
              <div style={{ flex: 1, maxWidth: "650px" }}>
                {/* Column Headers */}
                <div style={{ display: "grid", gridTemplateColumns: "120px repeat(5, 1fr)", gap: "4px", marginBottom: "4px", textAlign: "center", fontWeight: "bold", fontSize: "0.75rem" }}>
                  <div></div>
                  <div>1. Muito Baixo</div>
                  <div>2. Baixo</div>
                  <div>3. Médio</div>
                  <div>4. Alto</div>
                  <div>5. Crítico</div>
                </div>

                {/* Rows (5 to 1) */}
                {[5, 4, 3, 2, 1].map((prob) => (
                  <div key={prob} style={{ display: "grid", gridTemplateColumns: "120px repeat(5, 1fr)", gap: "4px", marginBottom: "4px" }}>
                    {/* Row Header */}
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      paddingRight: "8px",
                      fontWeight: "bold",
                      fontSize: "0.75rem",
                      textAlign: "right",
                      background: "#f0f0ed",
                      borderRadius: "4px",
                    }}>
                      {prob === 5 && "Quase Certo (5)"}
                      {prob === 4 && "Provável (4)"}
                      {prob === 3 && "Possível (3)"}
                      {prob === 2 && "Pouco Provável (2)"}
                      {prob === 1 && "Raro (1)"}
                    </div>

                    {/* Heatmap cells (Impact 1 to 5) */}
                    {[1, 2, 3, 4, 5].map((imp) => {
                      const level = getRiskLevel(prob, imp);
                      const count = cellCounts[`${prob}-${imp}`] || 0;
                      const isSelected = selectedCell?.prob === prob && selectedCell?.imp === imp;

                      return (
                        <button
                          key={imp}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCell(null);
                            } else {
                              setSelectedCell({ prob, imp });
                            }
                          }}
                          style={{
                            aspectRatio: "2.2 / 1",
                            background: level.bg,
                            color: level.text,
                            border: isSelected ? "3px solid var(--accent)" : "1px solid rgba(0,0,0,0.08)",
                            borderRadius: "6px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            boxShadow: isSelected ? "var(--shadow-lg)" : "none",
                            transition: "all 0.15s ease",
                            position: "relative",
                          }}
                          title={`Score: ${level.score} (${level.label}) - ${count} risco(s)`}
                        >
                          <span style={{ fontSize: "1.1rem", fontWeight: "800" }}>{count}</span>
                          <span style={{ fontSize: "0.6rem", opacity: 0.8, textTransform: "uppercase" }}>
                            Score {level.score}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap", fontSize: "0.8rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "12px", height: "12px", background: "#dcfce7", borderRadius: "3px" }} />
            <span>Baixo (1 - 4)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "12px", height: "12px", background: "#fef9c3", borderRadius: "3px" }} />
            <span>Médio (5 - 9)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "12px", height: "12px", background: "#ffedd5", borderRadius: "3px" }} />
            <span>Alto (10 - 14)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "12px", height: "12px", background: "#fee2e2", borderRadius: "3px" }} />
            <span>Crítico (15 - 25)</span>
          </div>
        </div>
      </div>

      {/* Filtros e Lista */}
      <div className="panel panel-spaced flex-row-filters" style={{ marginTop: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
            Status do Risco
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {selectedCell && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "18px" }}>
            <span className="badge badge-warning" style={{ fontSize: "0.85rem", padding: "6px 12px" }}>
              Filtro ativo: Probabilidade {selectedCell.prob} × Impacto {selectedCell.imp}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedCell(null)}
              style={{ padding: "4px 8px" }}
            >
              Limpar Filtro
            </button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <span className="muted">Carregando riscos...</span>
        </div>
      ) : filteredRisks.length === 0 ? (
        <div className="panel text-center" style={{ padding: "3rem", marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>🛡️</span>
          <h3 style={{ margin: "1rem 0 0.5rem" }}>Nenhum risco encontrado</h3>
          <p className="muted" style={{ margin: 0 }}>
            Tente mudar os filtros ou registre um novo risco acima.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: "1.5rem", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Risco</th>
                <th>Exposição</th>
                <th>Status</th>
                <th>Plano de Mitigação</th>
                <th>Vínculos (ITIL)</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {filteredRisks.map((r) => {
                const lvl = getRiskLevel(r.probability, r.impact);
                return (
                  <tr key={r.id}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--accent)" }}>{r.title}</div>
                        {r.description && (
                          <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                            {r.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          background: lvl.bg,
                          color: lvl.text,
                          width: "max-content",
                        }}>
                          {lvl.label} ({lvl.score})
                        </span>
                        <small className="muted" style={{ fontSize: "0.7rem" }}>
                          P: {r.probability} | I: {r.impact}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td>
                      {r.mitigationPlan ? (
                        <span style={{ fontSize: "0.85rem" }}>{r.mitigationPlan}</span>
                      ) : (
                        <span className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic" }}>
                          Nenhum plano cadastrado
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {r.problem ? (
                          <Link to={`/problems/${r.problemId}`} className="badge badge-purple" style={{ fontSize: "0.75rem", display: "inline-block", width: "max-content" }}>
                            Problema: {r.problem.title}
                          </Link>
                        ) : null}
                        {r.change ? (
                          <Link to={`/changes/${r.changeId}`} className="badge badge-blue" style={{ fontSize: "0.75rem", display: "inline-block", width: "max-content" }}>
                            Mudança: {r.change.title}
                          </Link>
                        ) : null}
                        {!r.problemId && !r.changeId && (
                          <span className="muted" style={{ fontSize: "0.8rem" }}>Sem vínculos</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
