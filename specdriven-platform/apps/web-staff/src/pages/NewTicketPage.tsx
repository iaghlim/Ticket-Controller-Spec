import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TicketKeySchema, TICKET_TYPES, TICKET_MODULES, type Client, type Project } from "@specdriven/shared";
import {
  ApiError,
  createTicket,
  listClients,
  listProjects,
  listTickets,
  listModules,
  type TicketModuleCatalogItem,
} from "../lib/api";

function nextDemoKey(existingKeys: string[]): string {
  let max = 0;
  for (const key of existingKeys) {
    const m = /^DEMO-(\d+)$/.exec(key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DEMO-${max + 1}`;
}

export function NewTicketPage() {
  const navigate = useNavigate();
  const suggested = useMemo(() => `DEMO-${Date.now().toString().slice(-4)}`, []);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [key, setKey] = useState(suggested);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<string>("melhoria");
  const [module, setModule] = useState<string>("");
  const [modules, setModules] = useState<TicketModuleCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingClients(true);
      try {
        const [clientsRes, modulesRes] = await Promise.all([
          listClients(),
          listModules(),
        ]);
        if (!cancelled) {
          setClients(clientsRes.clients);
          setModules(modulesRes.modules);
          if (clientsRes.clients[0]) setClientId(clientsRes.clients[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Falha ao carregar clientes.",
          );
        }
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega projetos quando o cliente muda
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!clientId) {
        setProjects([]);
        setProjectId("");
        return;
      }
      setLoadingProjects(true);
      try {
        const res = await listProjects(clientId);
        if (!cancelled) {
          setProjects(res.projects);
          // Pré-seleciona o primeiro projeto se houver
          setProjectId(res.projects[0]?.id ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Falha ao carregar projetos.",
          );
        }
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function suggestFromList() {
    try {
      const { tickets } = await listTickets();
      setKey(nextDemoKey(tickets.map((t) => t.key)));
    } catch {
      /* keep current */
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Selecione um cliente.");
      return;
    }
    if (!projectId) {
      setError("Selecione um projeto.");
      return;
    }
    if (!TicketKeySchema.safeParse(key.trim()).success) {
      setError("Chave inválida. Use o formato PREFIXO-123 (ex.: DEMO-2).");
      return;
    }

    setSubmitting(true);
    try {
      const { ticket } = await createTicket({
        key: key.trim().toUpperCase(),
        title: title.trim(),
        clientId,
        projectId,
        description: description.trim() || undefined,
        ticketType,
        module: module || undefined,
      });
      navigate(`/tickets/${encodeURIComponent(ticket.key)}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError("Já existe um chamado com essa chave.");
        else setError(err.message);
      } else {
        setError("Falha ao criar chamado.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Operação</p>
          <h1 className="page-title-serif">Novo chamado.</h1>
          <p>Abra um chamado em nome de um cliente.</p>
        </div>
        <Link className="btn btn-ghost" to="/tickets">
          Voltar
        </Link>
      </div>

      <div className="panel">
        <form className="form" onSubmit={onSubmit}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="clientId">Cliente</label>
              <select
                id="clientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                disabled={loadingClients}
              >
                {clients.length === 0 ? (
                  <option value="">Nenhum cliente</option>
                ) : null}
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="projectId">Projeto *</label>
              <select
                id="projectId"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                disabled={loadingProjects || projects.length === 0}
              >
                {projects.length === 0 ? (
                  <option value="">
                    {clientId ? "Nenhum projeto cadastrado" : "Selecione um cliente"}
                  </option>
                ) : null}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="ticketType">Tipo</label>
              <select
                id="ticketType"
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value)}
              >
                {TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="module">Módulo</label>
              <select
                id="module"
                value={module}
                onChange={(e) => setModule(e.target.value)}
              >
                <option value="">— Nenhum —</option>
                {modules.length > 0
                  ? modules.map((m) => (
                      <option key={m.id} value={m.key}>
                        {m.label}
                      </option>
                    ))
                  : TICKET_MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="key">Chave</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                id="key"
                className="mono"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                required
                pattern="[A-Z][A-Z0-9]+-\d+"
                title="PREFIXO-123"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void suggestFromList()}
              >
                Sugerir
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="title">Título</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={1}
            />
          </div>
          <div className="field">
            <label htmlFor="description">Descrição</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Criando…" : "Abrir chamado"}
          </button>
        </form>
      </div>
    </>
  );
}
