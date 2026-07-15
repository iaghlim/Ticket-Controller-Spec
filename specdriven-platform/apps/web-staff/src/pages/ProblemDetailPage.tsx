import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getProblem,
  patchProblem,
  linkIncidentToProblem,
  unlinkIncidentFromProblem,
  createChange,
  listClients,
  type Problem,
  type ProblemStatus,
} from "../lib/api";
import { type Client } from "@specdriven/shared";

const STATUS_LABELS: Record<ProblemStatus, string> = {
  investigating: "Investigando",
  identified: "Identificado",
  known_error: "Erro Conhecido",
  closed: "Resolvido/Fechado",
};

export function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edição
  const [editingFields, setEditingFields] = useState(false);
  const [status, setStatus] = useState<ProblemStatus>("investigating");
  const [rootCause, setRootCause] = useState("");
  const [workaround, setWorkaround] = useState("");
  const [savingFields, setSavingFields] = useState(false);

  // Vincular Incidente
  const [ticketKeyInput, setTicketKeyInput] = useState("");
  const [linking, setLinking] = useState(false);

  // Criar Change Associada
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeTitle, setChangeTitle] = useState("");
  const [changeDesc, setChangeDesc] = useState("");
  const [changeRisk, setChangeRisk] = useState(1);
  const [changeRollback, setChangeRollback] = useState("");
  const [creatingChangeState, setCreatingChangeState] = useState(false);

  async function loadProblem() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [probData, clientsRes] = await Promise.all([
        getProblem(id),
        listClients(),
      ]);
      if (probData) {
        setProblem(probData);
        setStatus(probData.status);
        setRootCause(probData.rootCause || "");
        setWorkaround(probData.workaround || "");
      } else {
        setError("Problema não encontrado.");
      }
      setClients(clientsRes.clients);
    } catch (err) {
      setError("Erro ao carregar o problema.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProblem();
  }, [id]);

  async function handleUpdateFields(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !problem) return;

    setSavingFields(true);
    try {
      const updated = await patchProblem(id, {
        status,
        rootCause: rootCause.trim() || null,
        workaround: workaround.trim() || null,
      });
      setProblem(updated);
      setEditingFields(false);
    } catch (err) {
      alert("Erro ao atualizar o problema.");
    } finally {
      setSavingFields(false);
    }
  }

  async function handleLinkIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !ticketKeyInput.trim()) return;

    setLinking(true);
    try {
      await linkIncidentToProblem(id, ticketKeyInput.trim().toUpperCase());
      setTicketKeyInput("");
      // Recarrega problema para atualizar incidentes vinculados
      const updated = await getProblem(id);
      if (updated) setProblem(updated);
    } catch (err) {
      alert("Erro ao vincular incidente. Verifique se a chave do chamado está correta.");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkIncident(ticketKey: string) {
    if (!id) return;
    if (!confirm(`Deseja desvincular o chamado ${ticketKey} deste problema?`)) return;

    try {
      await unlinkIncidentFromProblem(id, ticketKey);
      const updated = await getProblem(id);
      if (updated) setProblem(updated);
    } catch (err) {
      alert("Erro ao desvincular o chamado.");
    }
  }

  async function handleCreateChange(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !changeTitle.trim()) return;

    setCreatingChangeState(true);
    try {
      await createChange({
        title: changeTitle.trim(),
        description: changeDesc.trim() || undefined,
        riskScore: Number(changeRisk),
        rollbackPlan: changeRollback.trim() || undefined,
        problemId: id,
      });
      setChangeTitle("");
      setChangeDesc("");
      setChangeRisk(1);
      setChangeRollback("");
      setShowChangeForm(false);
      
      // Recarrega problema para exibir a nova change na lista
      const updated = await getProblem(id);
      if (updated) setProblem(updated);
    } catch (err) {
      alert("Erro ao criar a mudança associada.");
    } finally {
      setCreatingChangeState(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <span className="muted">Carregando detalhes do problema...</span>
      </div>
    );
  }

  if (error || !problem) {
    return (
      <div className="container-lg">
        <div className="alert alert-error">{error || "Problema não encontrado"}</div>
        <Link to="/problems" className="btn btn-ghost">
          Voltar para Lista
        </Link>
      </div>
    );
  }

  const clientObj = clients.find((c) => c.id === problem.clientId);

  return (
    <div className="container-lg">
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/problems" className="muted" style={{ fontSize: "0.9rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          ← Voltar para problemas
        </Link>
      </div>

      <div className="flex-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="badge badge-purple" style={{ textTransform: "uppercase" }}>Problema</span>
            <span className="muted" style={{ fontSize: "0.9rem" }}>#{problem.id.slice(0, 8)}</span>
          </div>
          <h1 style={{ marginTop: "4px" }}>{problem.title}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Cliente afetado primário: <strong>{clientObj ? clientObj.name : "Nenhum/Geral"}</strong>
          </p>
        </div>
        <div>
          <span className={`badge ${
            problem.status === "investigating" ? "badge-blue" :
            problem.status === "identified" ? "badge-warning" :
            problem.status === "known_error" ? "badge-purple" : "badge-success"
          }`} style={{ fontSize: "1rem", padding: "6px 12px" }}>
            {STATUS_LABELS[problem.status]}
          </span>
        </div>
      </div>

      {problem.description && (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <h3>Descrição do Sintoma</h3>
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{problem.description}</p>
        </div>
      )}

      {/* Grid de Informações e Edição */}
      <div className="grid" style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "1.5rem" }}>
        
        {/* Lado Esquerdo: Diagnóstico e Causa Raiz */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="panel">
            <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Diagnóstico ITIL</h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setEditingFields(!editingFields)}
              >
                {editingFields ? "Cancelar" : "Editar Diagnóstico"}
              </button>
            </div>

            {editingFields ? (
              <form onSubmit={handleUpdateFields} className="form form-spaced">
                <div className="field">
                  <label htmlFor="edit-status">Status do Problema</label>
                  <select
                    id="edit-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProblemStatus)}
                  >
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="edit-rootcause">Causa Raiz</label>
                  <textarea
                    id="edit-rootcause"
                    rows={4}
                    value={rootCause}
                    onChange={(e) => setRootCause(e.target.value)}
                    placeholder="Descreva a causa investigada e confirmada do problema..."
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-workaround">Solução de Contorno (Workaround)</label>
                  <textarea
                    id="edit-workaround"
                    rows={4}
                    value={workaround}
                    onChange={(e) => setWorkaround(e.target.value)}
                    placeholder="Descreva a solução temporária para diminuir o impacto nos clientes..."
                  />
                </div>
                <button type="submit" className="btn" disabled={savingFields}>
                  {savingFields ? "Salvando..." : "Salvar Alterações"}
                </button>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <h4 className="muted" style={{ margin: "0 0 4px" }}>Causa Raiz</h4>
                  {problem.rootCause ? (
                    <p style={{ margin: 0, whiteSpace: "pre-line" }}>{problem.rootCause}</p>
                  ) : (
                    <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>Nenhuma causa raiz cadastrada ainda.</p>
                  )}
                </div>
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  <h4 className="muted" style={{ margin: "0 0 4px" }}>Solução de Contorno (Workaround)</h4>
                  {problem.workaround ? (
                    <p style={{ margin: 0, whiteSpace: "pre-line" }}>{problem.workaround}</p>
                  ) : (
                    <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>Nenhuma solução de contorno cadastrada ainda.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mudanças Relacionadas */}
          <div className="panel">
            <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Mudanças Associadas (Changes)</h2>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowChangeForm(!showChangeForm)}
              >
                {showChangeForm ? "Cancelar" : "Criar Mudança"}
              </button>
            </div>

            {showChangeForm && (
              <form onSubmit={handleCreateChange} className="form form-spaced" style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                <h3>Registrar Mudança Relacionada</h3>
                <div className="field">
                  <label htmlFor="change-title">Título da Mudança *</label>
                  <input
                    id="change-title"
                    type="text"
                    required
                    value={changeTitle}
                    onChange={(e) => setChangeTitle(e.target.value)}
                    placeholder="Ex: Aplicação de patch de banco e indexação"
                  />
                </div>
                <div className="field">
                  <label htmlFor="change-desc">Descrição do Plano</label>
                  <textarea
                    id="change-desc"
                    rows={2}
                    value={changeDesc}
                    onChange={(e) => setChangeDesc(e.target.value)}
                    placeholder="O que será executado nessa mudança..."
                  />
                </div>
                <div className="field">
                  <label htmlFor="change-risk">Grau de Risco (1 a 5)</label>
                  <select
                    id="change-risk"
                    value={changeRisk}
                    onChange={(e) => setChangeRisk(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((val) => (
                      <option key={val} value={val}>Risco {val}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="change-rollback">Plano de Retorno (Rollback)</label>
                  <textarea
                    id="change-rollback"
                    rows={2}
                    value={changeRollback}
                    onChange={(e) => setChangeRollback(e.target.value)}
                    placeholder="Como reverter a mudança se algo der errado..."
                  />
                </div>
                <button type="submit" className="btn btn-sm" disabled={creatingChangeState}>
                  {creatingChangeState ? "Criando..." : "Criar Mudança"}
                </button>
              </form>
            )}

            {(!problem.changes || problem.changes.length === 0) ? (
              <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>
                Nenhuma mudança registrada para este problema.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {problem.changes.map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                    <div>
                      <Link to={`/changes/${c.id}`} style={{ fontWeight: 600, color: "var(--accent)" }}>
                        {c.title}
                      </Link>
                      <div className="muted" style={{ fontSize: "0.8rem", marginTop: "4px" }}>
                        Grau de Risco: {c.riskScore} • Criado em {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <span className={`badge ${
                      c.status === "draft" ? "badge-gray" :
                      c.status === "pending_approval" ? "badge-warning" :
                      c.status === "approved" ? "badge-success" :
                      c.status === "rejected" ? "badge-danger" : "badge-blue"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Chamados Vinculados (Incidentes) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Incidentes Vinculados</h2>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                Chamados de clientes associados a este problema.
              </p>
            </div>

            {/* Form Vincular */}
            <form onSubmit={handleLinkIncident} className="form" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                type="text"
                required
                value={ticketKeyInput}
                onChange={(e) => setTicketKeyInput(e.target.value)}
                placeholder="Chave do ticket (ex: DEMO-1)"
                style={{ flex: 1, textTransform: "uppercase" }}
              />
              <button type="submit" className="btn btn-sm" disabled={linking}>
                {linking ? "..." : "Vincular"}
              </button>
            </form>

            {(!problem.incidents || problem.incidents.length === 0) ? (
              <p className="muted" style={{ margin: 0, fontStyle: "italic", textAlign: "center", padding: "1.5rem 0" }}>
                Nenhum chamado de incidente vinculado.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {problem.incidents.map((inc) => (
                  <div key={inc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-soft)" }}>
                    <div style={{ overflow: "hidden", marginRight: "8px" }}>
                      <Link to={`/tickets/${inc.key}`} style={{ fontWeight: 600, color: "var(--accent)" }}>
                        {inc.key}
                      </Link>
                      <div className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {inc.title}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ color: "var(--danger)", padding: "2px 6px" }}
                      onClick={() => handleUnlinkIncident(inc.key)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dados Sistêmicos */}
          <div className="panel" style={{ background: "var(--bg-soft)", fontSize: "0.85rem" }}>
            <h4 style={{ margin: "0 0 8px", fontWeight: "bold" }}>Metadados do Registro</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div>Criado em: {new Date(problem.createdAt).toLocaleString("pt-BR")}</div>
              <div>Atualizado em: {new Date(problem.updatedAt).toLocaleString("pt-BR")}</div>
              <div>Identificador Único: <code style={{ fontSize: "0.75rem" }}>{problem.id}</code></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
