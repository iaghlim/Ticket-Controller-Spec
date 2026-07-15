import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Client, User, UserRole, Project } from "@specdriven/shared";
import {
  ApiError,
  createClient,
  createInvite,
  listClients,
  listInvites,
  listProjects,
  listUsers,
  type Invite,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, roleLabel } from "../lib/labels";
import { Link } from "react-router-dom";

export function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, Project[]>>({});
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("cliente");
  const [inviteClientId, setInviteClientId] = useState("");
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);

  const roleOptions: UserRole[] =
    user?.role === "consultor"
      ? ["cliente"]
      : user?.role === "admin"
        ? ["cliente", "consultor", "gestor"]
        : user?.role === "master"
          ? ["cliente", "consultor", "gestor", "admin"]
          : ["cliente", "consultor", "gestor"];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, i, u] = await Promise.all([
        listClients(),
        listInvites(),
        listUsers(),
      ]);
      setClients(c.clients);
      setInvites(i.invites);
      setUsers(u.users);
      setInviteClientId((prev) => prev || c.clients[0]?.id || "");

      // Load projects for each client
      const map: Record<string, Project[]> = {};
      await Promise.all(
        c.clients.map(async (client) => {
          try {
            const res = await listProjects(client.id);
            map[client.id] = res.projects ?? [];
          } catch {
            map[client.id] = [];
          }
        }),
      );
      setProjectsMap(map);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar clientes/convites.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    setOk(null);
    try {
      const { client } = await createClient({
        name: name.trim(),
        code: code.trim() || undefined,
      });
      setClients((prev) =>
        [...prev, client].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setProjectsMap((prev) => ({ ...prev, [client.id]: [] }));
      setName("");
      setCode("");
      setInviteClientId((prev) => prev || client.id);
      setOk("Cliente cadastrado.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao criar cliente.");
    } finally {
      setCreating(false);
    }
  }

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setOk(null);
    setLastToken(null);
    try {
      const res = await createInvite({
        email: inviteEmail.trim(),
        role: inviteRole,
        clientId: inviteRole === "cliente" ? inviteClientId || null : null,
      });
      setInvites((prev) => [res.invite, ...prev]);
      setInviteEmail("");
      setOk(`Convite criado para ${res.invite.email}.`);
      if (res.invite.token) setLastToken(res.invite.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao convidar.");
    } finally {
      setInviting(false);
    }
  }

  function getClientUsers(clientId: string): User[] {
    return users.filter((u) => u.clientId === clientId);
  }

  function getClientInvites(clientId: string): Invite[] {
    return invites.filter((i) => i.clientId === clientId);
  }

  function getClientProjects(clientId: string): Project[] {
    return projectsMap[clientId] ?? [];
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title-serif">Clientes, Projetos e Usuários.</h1>
          <p>Cadastro de clientes, projetos por cliente, usuários da org e convites.</p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}
      {lastToken ? (
        <p className="warn-banner">
          Token (smoke local, uma vez):{" "}
          <code className="mono">{lastToken}</code>
        </p>
      ) : null}

      {/* Client Cards with Hierarchy */}
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Clientes</h2>
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && clients.length === 0 ? (
          <p className="empty">Nenhum cliente cadastrado.</p>
        ) : null}

        {clients.map((c, i) => {
          const clientUsers = getClientUsers(c.id);
          const clientInvites = getClientInvites(c.id);
          const clientProjects = getClientProjects(c.id);
          const isExpanded = expandedClient === c.id;

          return (
            <div
              key={c.id}
              className="ticket-row"
              style={{
                animationDelay: `${i * 40}ms`,
                flexDirection: "column",
                alignItems: "stretch",
                cursor: "pointer",
              }}
            >
              {/* Client Header */}
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onClick={() => setExpandedClient(isExpanded ? null : c.id)}
              >
                <div style={{ flex: 1 }}>
                  <div className="ticket-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem" }}>{isExpanded ? "▼" : "▶"}</span>
                    {c.name}
                    {c.code ? (
                      <code className="mono" style={{ fontSize: "0.75rem", opacity: 0.6 }}>{c.code}</code>
                    ) : null}
                  </div>
                  <div className="ticket-meta">
                    {clientProjects.length} projeto(s) · {clientUsers.length} usuário(s) · {clientInvites.length} convite(s) pendente(s) · criado {formatDate(c.createdAt)}
                  </div>
                </div>
                <Link
                  className="btn btn-sm btn-ghost"
                  to={`/settings/projects`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flexShrink: 0 }}
                >
                  + Novo Projeto
                </Link>
              </div>

              {/* Expanded details */}
              {isExpanded ? (
                <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  <div className="ok-banner" style={{ marginBottom: "1rem", padding: "0.6rem 0.75rem", fontSize: "0.82rem", background: "#eaf4ea", border: "1px solid #b6d4b6", borderRadius: "6px", color: "#2d6a2d" }}>
                    <strong>&#9889; Vínculo automático:</strong> Usuários "Cliente" deste cliente enxergam <strong>todos os projetos</strong> abaixo no portal ao abrir chamado. Basta criar o projeto em <Link to="/settings/projects">Configurações → Projetos</Link>. A associação é automática pelo cliente.
                  </div>
                  {/* Projects */}
                  <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    Projetos ({clientProjects.length})
                  </h4>
                  {clientProjects.length === 0 ? (
                    <p className="empty" style={{ fontSize: "0.8rem" }}>
                      Nenhum projeto.{" "}
                      <Link to="/settings/projects" style={{ fontWeight: "600" }}>Criar projeto</Link> para este cliente.
                    </p>
                  ) : (
                    <div className="data-table-wrap" style={{ marginBottom: "1rem" }}>
                      <table className="data-table" style={{ fontSize: "0.82rem" }}>
                        <thead>
                          <tr>
                            <th>Projeto</th>
                            <th>Código</th>
                            <th>Faturamento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientProjects.map((p) => (
                            <tr key={p.id}>
                              <td style={{ fontWeight: "500" }}>{p.name}</td>
                              <td className="mono table-meta">{p.code}</td>
                              <td className="table-meta">
                                {p.billingModel === "per_hour"
                                  ? "Hora (T&M)"
                                  : p.billingModel === "per_ticket"
                                    ? "Por Ticket"
                                    : "Preço Fixo"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Users */}
                  <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                    Usuários do cliente ({clientUsers.length})
                  </h4>
                  {clientUsers.length === 0 ? (
                    <p className="empty" style={{ fontSize: "0.8rem" }}>
                      Nenhum usuário. Convide um novo usuário com papel "Cliente".
                    </p>
                  ) : (
                    <div className="data-table-wrap" style={{ marginBottom: "1rem" }}>
                      <table className="data-table" style={{ fontSize: "0.82rem" }}>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>E-mail</th>
                            <th>Papel</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientUsers.map((u) => (
                            <tr key={u.id}>
                              <td style={{ fontWeight: "500" }}>
                                {u.name}
                                {u.id === user?.id ? " (você)" : ""}
                              </td>
                              <td className="mono table-meta">{u.email}</td>
                              <td className="table-meta">{roleLabel(u.role)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pending Invites */}
                  {clientInvites.length > 0 ? (
                    <>
                      <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                        Convites pendentes ({clientInvites.length})
                      </h4>
                      <div className="data-table-wrap">
                        <table className="data-table" style={{ fontSize: "0.82rem" }}>
                          <thead>
                            <tr>
                              <th>E-mail</th>
                              <th>Expira em</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientInvites.map((inv) => (
                              <tr key={inv.id}>
                                <td className="mono">{inv.email}</td>
                                <td className="table-meta">{formatDate(inv.expiresAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* New Client Form */}
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Novo cliente</h2>
        <form className="form" onSubmit={onCreate}>
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="code">Código (opcional)</label>
            <input
              id="code"
              className="mono"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ACME"
            />
          </div>
          <button className="btn" type="submit" disabled={creating}>
            {creating ? "Criando…" : "Cadastrar"}
          </button>
        </form>
      </div>

      {/* Invite Form */}
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Convidar usuário</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          O convite será enviado por e-mail. O usuário aceita em /accept-invite?token=…
        </p>
        <form className="form" onSubmit={onInvite}>
          <div className="field">
            <label htmlFor="inviteEmail">E-mail</label>
            <input
              id="inviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="inviteRole">Papel</label>
            <select
              id="inviteRole"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            {inviteRole === "cliente" ? (
              <span className="muted field-note" style={{ display: "block", marginTop: "0.25rem" }}>
                O usuário será automaticamente vinculado ao cliente selecionado abaixo.
              </span>
            ) : null}
          </div>
          {inviteRole === "cliente" ? (
            <div className="field">
              <label htmlFor="inviteClient">Cliente *</label>
              <select
                id="inviteClient"
                value={inviteClientId}
                onChange={(e) => setInviteClientId(e.target.value)}
                required
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button className="btn" type="submit" disabled={inviting}>
            {inviting ? "Enviando…" : "Convidar"}
          </button>
        </form>
      </div>

      {/* All Org Users */}
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Todos os usuários da org</h2>
        {!loading && users.length === 0 ? (
          <p className="muted">Nenhum usuário.</p>
        ) : null}
        <ul className="ticket-list">
          {users.map((u) => (
            <li key={u.id} className="ticket-row">
              <div>
                <div className="ticket-title">
                  {u.name}
                  {u.id === user?.id ? " (você)" : ""}
                </div>
                <div className="ticket-meta">
                  {u.email} · {roleLabel(u.role)}
                  {u.clientId ? ` · vinculado a ${clients.find((c) => c.id === u.clientId)?.name ?? u.clientId}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* All Invites */}
      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Convites recentes</h2>
        {!loading && invites.length === 0 ? (
          <p className="muted">Nenhum convite.</p>
        ) : null}
        <ul className="ticket-list">
          {invites.map((inv) => (
            <li key={inv.id} className="ticket-row">
              <div>
                <div className="ticket-title">{inv.email}</div>
                <div className="ticket-meta">
                  {roleLabel(inv.role)}
                  {inv.clientId ? ` · ${clients.find((c) => c.id === inv.clientId)?.name ?? inv.clientId}` : ""}
                  {" · expira "}{formatDate(inv.expiresAt)}
                  {inv.acceptedAt
                    ? ` · aceito ${formatDate(inv.acceptedAt)}`
                    : " · pendente"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
