import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TicketKeySchema, type Client } from "@specdriven/shared";
import { ApiError, createTicket, listClients, listTickets } from "../lib/api";

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
  const [key, setKey] = useState(suggested);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingClients(true);
      try {
        const { clients: list } = await listClients();
        if (!cancelled) {
          setClients(list);
          if (list[0]) setClientId(list[0].id);
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
        description: description.trim() || undefined,
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
