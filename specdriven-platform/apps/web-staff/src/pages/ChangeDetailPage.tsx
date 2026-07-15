import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getChange,
  submitChangeForApproval,
  decideCabChange,
  patchChange,
  type Change,
  type ChangeStatus,
} from "../lib/api";
import { useAuth } from "../lib/auth";

const STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Pendente Aprovação",
  approved: "Aprovada pelo CAB",
  rejected: "Rejeitada pelo CAB",
  implementing: "Em Execução",
  completed: "Concluída com Sucesso",
  failed: "Fracassada / Revertida",
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

export function ChangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [change, setChange] = useState<Change | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decisão do CAB
  const [cabNote, setCabNote] = useState("");
  const [deciding, setDeciding] = useState(false);

  // Janela / Planejamento
  const [editingPlan, setEditingPlan] = useState(false);
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [rollbackPlan, setRollbackPlan] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  async function loadChange() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getChange(id);
      if (data) {
        setChange(data);
        setWindowStart(data.windowStart ? data.windowStart.slice(0, 16) : "");
        setWindowEnd(data.windowEnd ? data.windowEnd.slice(0, 16) : "");
        setRollbackPlan(data.rollbackPlan || "");
      } else {
        setError("Solicitação de mudança não encontrada.");
      }
    } catch (err) {
      setError("Erro ao carregar os detalhes da mudança.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChange();
  }, [id]);

  async function handleSendForApproval() {
    if (!id) return;
    try {
      const res = await submitChangeForApproval(id);
      setChange(res);
    } catch (err) {
      alert("Erro ao enviar a mudança para aprovação.");
    }
  }

  async function handleCabDecision(decision: "approved" | "rejected") {
    if (!id) return;
    setDeciding(true);
    try {
      const res = await decideCabChange(id, decision, cabNote.trim());
      setChange(res);
      setCabNote("");
    } catch (err) {
      alert("Erro ao enviar decisão do CAB.");
    } finally {
      setDeciding(false);
    }
  }

  async function handleUpdatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    setSavingPlan(true);
    try {
      const res = await patchChange(id, {
        windowStart: windowStart ? new Date(windowStart).toISOString() : null,
        windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
        rollbackPlan: rollbackPlan.trim() || null,
      });
      setChange(res);
      setEditingPlan(false);
    } catch (err) {
      alert("Erro ao atualizar o planejamento da mudança.");
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleUpdateStatus(newStatus: ChangeStatus) {
    if (!id) return;
    try {
      const res = await patchChange(id, { status: newStatus });
      setChange(res);
    } catch (err) {
      alert("Erro ao atualizar status da mudança.");
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <span className="muted">Carregando detalhes da mudança...</span>
      </div>
    );
  }

  if (error || !change) {
    return (
      <div className="container-lg">
        <div className="alert alert-error">{error || "Mudança não encontrada"}</div>
        <Link to="/changes" className="btn btn-ghost">
          Voltar para Lista
        </Link>
      </div>
    );
  }

  // Verifica se o usuário logado é gestor (para permitir aprovação do CAB)
  const isGestorOrAdmin = user?.role === "gestor" || user?.role === "admin" || user?.role === "master";

  return (
    <div className="container-lg">
      <div style={{ marginBottom: "1rem" }}>
        <Link to="/changes" className="muted" style={{ fontSize: "0.9rem", display: "inline-flex", alignItems: "center", gap: "4px" }}>
          ← Voltar para mudanças
        </Link>
      </div>

      <div className="flex-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="badge badge-warning" style={{ textTransform: "uppercase" }}>Mudança (Change)</span>
            <span className="muted" style={{ fontSize: "0.9rem" }}>#{change.id.slice(0, 8)}</span>
          </div>
          <h1 style={{ marginTop: "4px" }}>{change.title}</h1>
          {change.problem && (
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Problema de origem:{" "}
              <Link to={`/problems/${change.problem.id}`} style={{ textDecoration: "underline", color: "var(--accent)" }}>
                {change.problem.title}
              </Link>
            </p>
          )}
        </div>
        <div>
          <span className={`badge ${STATUS_COLORS[change.status]}`} style={{ fontSize: "1rem", padding: "6px 12px" }}>
            {STATUS_LABELS[change.status]}
          </span>
        </div>
      </div>

      <div className="grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem", marginTop: "1.5rem" }}>
        
        {/* Lado Esquerdo: Detalhes e Fluxos */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="panel">
            <h3>Descrição do Escopo</h3>
            <p style={{ margin: 0, whiteSpace: "pre-line" }}>
              {change.description || "Nenhuma descrição fornecida."}
            </p>
          </div>

          {/* Planejamento e Janela de Execução */}
          <div className="panel">
            <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Janela de Execução &amp; Rollback</h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setEditingPlan(!editingPlan)}
              >
                {editingPlan ? "Cancelar" : "Editar Plano"}
              </button>
            </div>

            {editingPlan ? (
              <form onSubmit={handleUpdatePlan} className="form form-spaced">
                <div className="field">
                  <label htmlFor="edit-start">Início da Janela</label>
                  <input
                    id="edit-start"
                    type="datetime-local"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-end">Fim da Janela</label>
                  <input
                    id="edit-end"
                    type="datetime-local"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-rollback">Plano de Retorno (Rollback)</label>
                  <textarea
                    id="edit-rollback"
                    rows={3}
                    value={rollbackPlan}
                    onChange={(e) => setRollbackPlan(e.target.value)}
                    placeholder="Descreva detalhadamente as etapas para reversão..."
                  />
                </div>
                <button type="submit" className="btn btn-sm" disabled={savingPlan}>
                  {savingPlan ? "Salvando..." : "Salvar Planejamento"}
                </button>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <h4 className="muted" style={{ margin: "0 0 4px" }}>Início da Janela</h4>
                    <p style={{ margin: 0 }}>
                      {change.windowStart ? (
                        new Date(change.windowStart).toLocaleString("pt-BR")
                      ) : (
                        <span className="muted">Não agendada</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <h4 className="muted" style={{ margin: "0 0 4px" }}>Fim da Janela</h4>
                    <p style={{ margin: 0 }}>
                      {change.windowEnd ? (
                        new Date(change.windowEnd).toLocaleString("pt-BR")
                      ) : (
                        <span className="muted">Não agendada</span>
                      )}
                    </p>
                  </div>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  <h4 className="muted" style={{ margin: "0 0 4px" }}>Plano de Retorno (Rollback Plan)</h4>
                  <p style={{ margin: 0, whiteSpace: "pre-line" }}>
                    {change.rollbackPlan || <span className="muted">Nenhum plano cadastrado.</span>}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Fluxo de Status - Submissão ou Execução */}
          {change.status === "draft" && (
            <div className="panel panel-spaced" style={{ border: "1px solid var(--border)", background: "rgba(107, 114, 128, 0.05)" }}>
              <h3>Envio para Comitê de Mudanças (CAB)</h3>
              <p className="muted">
                Antes de ser executada, a mudança precisa ser aprovada pelo CAB. Ao enviar, ela mudará para o status "Pendente Aprovação".
              </p>
              <button className="btn" onClick={handleSendForApproval}>
                Enviar para Aprovação
              </button>
            </div>
          )}

          {change.status === "approved" && (
            <div className="panel panel-spaced" style={{ border: "1px solid var(--border)", background: "rgba(59, 130, 246, 0.05)" }}>
              <h3>Execução da Mudança</h3>
              <p className="muted">
                Esta mudança foi aprovada pelo CAB e está pronta para ser executada durante a janela agendada.
              </p>
              <button className="btn" onClick={() => handleUpdateStatus("implementing")}>
                Iniciar Implementação
              </button>
            </div>
          )}

          {change.status === "implementing" && (
            <div className="panel panel-spaced" style={{ border: "1px solid var(--border)", background: "rgba(234, 179, 8, 0.05)" }}>
              <h3>Status da Implementação</h3>
              <p className="muted">
                A mudança está sendo implementada no momento. Por favor, registre se foi concluída com sucesso ou se falhou.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-success" onClick={() => handleUpdateStatus("completed")}>
                  Concluída com Sucesso
                </button>
                <button className="btn btn-danger" onClick={() => handleUpdateStatus("failed")}>
                  Falhou / Exigiu Rollback
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Lado Direito: Decisão do CAB e Metadados */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {/* Decisão do CAB */}
          <div className="panel">
            <div className="panel-head" style={{ marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Decisão do CAB</h2>
              <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0" }}>
                Comitê de Controle de Mudanças da plataforma.
              </p>
            </div>

            {change.status === "pending_approval" ? (
              isGestorOrAdmin ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="field">
                    <label htmlFor="cab-note">Notas de Decisão do CAB</label>
                    <textarea
                      id="cab-note"
                      rows={3}
                      value={cabNote}
                      onChange={(e) => setCabNote(e.target.value)}
                      placeholder="Justifique a aprovação ou reprovação da mudança..."
                    />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-success"
                      style={{ flex: 1 }}
                      disabled={deciding}
                      onClick={() => handleCabDecision("approved")}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ flex: 1 }}
                      disabled={deciding}
                      onClick={() => handleCabDecision("rejected")}
                    >
                      Reprovar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="alert alert-warning" style={{ margin: 0, fontSize: "0.9rem" }}>
                  Aguardando avaliação dos gestores no CAB.
                </div>
              )
            ) : change.cabDecision ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className={`badge ${change.cabDecision === "approved" ? "badge-success" : "badge-danger"}`}>
                    {change.cabDecision === "approved" ? "APROVADA" : "REJEITADA"}
                  </span>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    em {change.cabDecisionAt ? new Date(change.cabDecisionAt).toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
                {change.cabDecisionNote && (
                  <div style={{ fontStyle: "italic", background: "var(--bg-soft)", padding: "0.75rem", borderRadius: "var(--radius-sm)", borderLeft: "4px solid var(--border)", fontSize: "0.9rem" }}>
                    "{change.cabDecisionNote}"
                  </div>
                )}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0, fontStyle: "italic" }}>
                Esta mudança ainda não passou por avaliação de aprovação do CAB.
              </p>
            )}
          </div>

          {/* Dados Sistêmicos */}
          <div className="panel" style={{ background: "var(--bg-soft)", fontSize: "0.85rem" }}>
            <h4 style={{ margin: "0 0 8px", fontWeight: "bold" }}>Dados da Solicitação</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div>Risco: <strong>Grau {change.riskScore}/5</strong></div>
              <div>Criado em: {new Date(change.createdAt).toLocaleString("pt-BR")}</div>
              <div>Atualizado em: {new Date(change.updatedAt).toLocaleString("pt-BR")}</div>
              <div>UUID: <code style={{ fontSize: "0.75rem" }}>{change.id}</code></div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
