import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listProblems,
  createProblem,
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

const STATUS_COLORS: Record<ProblemStatus, string> = {
  investigating: "badge-blue",
  identified: "badge-warning",
  known_error: "badge-purple",
  closed: "badge-success",
};

export function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [clientFilter, setClientFilter] = useState<string>("");

  // Criação
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [probs, clientsRes] = await Promise.all([
        listProblems(
          clientFilter || undefined,
          statusFilter ? (statusFilter as ProblemStatus) : undefined
        ),
        listClients(),
      ]);
      setProblems(probs);
      setClients(clientsRes.clients);
    } catch (err) {
      setError("Erro ao carregar os dados de problemas.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [statusFilter, clientFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreating(true);
    try {
      await createProblem({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        clientId: newClientId || undefined,
      });
      setNewTitle("");
      setNewDescription("");
      setNewClientId("");
      setShowCreateForm(false);
      await loadData();
    } catch (err) {
      alert("Erro ao criar o problema.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="container-lg">
      <div className="flex-head">
        <div>
          <h1>Problemas</h1>
          <p className="muted">Análise de causa raiz e gestão de erros conhecidos (ITIL)</p>
        </div>
        <button
          className="btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancelar" : "Novo Problema"}
        </button>
      </div>

      {showCreateForm && (
        <div className="panel panel-spaced" style={{ marginTop: "1rem" }}>
          <div className="panel-head">
            <h2>Registrar Novo Problema</h2>
          </div>
          <form onSubmit={handleCreate} className="form form-spaced">
            <div className="field">
              <label htmlFor="prob-title">Título do problema *</label>
              <input
                id="prob-title"
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Lentidão generalizada no banco de dados"
              />
            </div>
            <div className="field">
              <label htmlFor="prob-desc">Descrição / Sintomas</label>
              <textarea
                id="prob-desc"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descreva os sintomas relatados nos incidentes..."
              />
            </div>
            <div className="field">
              <label htmlFor="prob-client">Cliente afetado primário (opcional)</label>
              <select
                id="prob-client"
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
              >
                <option value="">Nenhum cliente específico</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit" disabled={creating}>
              {creating ? "Registrando..." : "Registrar Problema"}
            </button>
          </form>
        </div>
      )}

      {/* Filtros */}
      <div className="panel panel-spaced flex-row-filters" style={{ marginTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
            Filtrar por Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 100 + "%" }}
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "4px" }}>
            Filtrar por Cliente
          </label>
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            style={{ width: 100 + "%" }}
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

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <span className="muted">Carregando problemas...</span>
        </div>
      ) : problems.length === 0 ? (
        <div className="panel text-center" style={{ padding: "3rem", marginTop: "1rem" }}>
          <span style={{ fontSize: "2rem" }}>🔍</span>
          <h3 style={{ margin: "1rem 0 0.5rem" }}>Nenhum problema encontrado</h3>
          <p className="muted" style={{ margin: 0 }}>
            Tente mudar os filtros ou registre um novo problema acima.
          </p>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: "1.5rem", overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Problema</th>
                <th>Status</th>
                <th>Cliente</th>
                <th>Incidentes</th>
                <th>Criado em</th>
                <th style={{ width: "80px" }}></th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => {
                const clientObj = clients.find((c) => c.id === p.clientId);
                return (
                  <tr key={p.id}>
                    <td>
                      <div>
                        <Link to={`/problems/${p.id}`} style={{ fontWeight: 600, color: "var(--accent)" }}>
                          {p.title}
                        </Link>
                        {p.description && (
                          <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 0", maxHeight: "40px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                            {p.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: "0.9rem" }}>
                        {clientObj ? clientObj.name : "Nenhum/Geral"}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-gray" style={{ fontWeight: "normal" }}>
                        {p.incidents?.length || 0} vinculados
                      </span>
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        {new Date(p.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </td>
                    <td>
                      <Link to={`/problems/${p.id}`} className="btn btn-sm btn-ghost">
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
  );
}
