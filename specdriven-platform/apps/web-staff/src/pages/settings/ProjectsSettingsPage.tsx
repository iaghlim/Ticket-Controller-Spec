import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Client, Project } from "@specdriven/shared";
import {
  ApiError,
  createProject,
  listClients,
  listProjects,
} from "../../lib/api";
import { formatDate } from "../../lib/labels";

export function ProjectsSettingsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
  }, [loadProjects]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (clientId) void loadProjects(clientId);
  }, [clientId, loadProjects]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId || !name.trim()) return;
    setCreating(true);
    setError(null);
    setOk(null);
    try {
      const { project } = await createProject({
        clientId,
        name: name.trim(),
        code: code.trim() ? code.trim() : null,
      });
      setProjects((prev) =>
        [...prev, project].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setCode("");
      setOk("Projeto criado.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao criar projeto.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p className="muted">Carregando projetos…</p>;
  }

  return (
    <div>
      <div className="panel-head">
        <h2>Projetos</h2>
        <p>
          Projetos vinculados a cada cliente — usados na organização de chamados
          e relatórios.
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

      {clientId ? (
        <form className="panel" onSubmit={(e) => void onSubmit(e)}>
          <h3 style={{ marginTop: 0 }}>Novo projeto</h3>
          <label className="field">
            <span>Nome</span>
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
            <span>Código (opcional)</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={32}
              placeholder="impl-erp"
              className="mono"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={creating}>
              {creating ? "Criando…" : "Criar projeto"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-section-head">
          <div>
            <h3>Projetos do cliente</h3>
            <p>{projects.length} projeto(s)</p>
          </div>
        </div>
        {projects.length === 0 ? (
          <p className="empty">Nenhum projeto cadastrado para este cliente.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Código</th>
                  <th>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="table-meta mono">{p.code ?? "—"}</td>
                    <td className="table-meta">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
