import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Client, User, UserRole, Project } from "@specdriven/shared";
import {
  ApiError,
  createClient,
  createInvite,
  linkUserToProject,
  listClients,
  listInvites,
  listProjects,
  listUserProjects,
  listUsers,
  unlinkUserFromProject,
  type Invite,
  type UserProjectLink,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, roleLabel } from "../lib/labels";
import { Link } from "react-router-dom";

interface ClientsPageProps {
  hideHeader?: boolean;
}

export function ClientsPage({ hideHeader = false }: ClientsPageProps = {}) {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectsMap, setProjectsMap] = useState<Record<string, Project[]>>({});
  const [userProjects, setUserProjects] = useState<UserProjectLink[]>([]);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  
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
  const [linking, setLinking] = useState(false);

  const [selectedUserToAdd, setSelectedUserToAdd] = useState<Record<string, string>>({});

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
      const [c, i, u, up] = await Promise.all([
        listClients(),
        listInvites(),
        listUsers(),
        listUserProjects().catch(() => ({ links: [] })),
      ]);
      setClients(c.clients);
      setInvites(i.invites);
      setUsers(u.users);
      setUserProjects(up.links || []);
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

  async function handleLinkUser(projectId: string, userId: string) {
    if (!projectId || !userId) return;
    setLinking(true);
    setError(null);
    try {
      const { link } = await linkUserToProject(projectId, userId);
      setUserProjects((prev) => {
        const filtered = prev.filter((l) => !(l.projectId === projectId && l.userId === userId));
        return [link, ...filtered];
      });
      setSelectedUserToAdd((prev) => ({ ...prev, [projectId]: "" }));
      setOk("Usuário associado ao projeto com sucesso.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao vincular usuário ao projeto.");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkUser(projectId: string, userId: string) {
    if (!projectId || !userId) return;
    setLinking(true);
    setError(null);
    try {
      await unlinkUserFromProject(projectId, userId);
      setUserProjects((prev) =>
        prev.filter((l) => !(l.projectId === projectId && l.userId === userId)),
      );
      setOk("Vínculo removido com sucesso.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao remover vínculo do projeto.");
    } finally {
      setLinking(false);
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

  function getProjectUsers(projectId: string): UserProjectLink[] {
    return userProjects.filter((l) => l.projectId === projectId && l.active);
  }

  function getUserProjectLinks(userId: string): UserProjectLink[] {
    return userProjects.filter((l) => l.userId === userId && l.active);
  }

  return (
    <>
      {!hideHeader ? (
        <div className="page-head">
          <div>
            <p className="page-eyebrow">Gestão & Escala de Permissões</p>
            <h1 className="page-title-serif">Clientes, Projetos e Usuários.</h1>
            <p>
              Pirâmide de Configuração: Consultoria → Cliente → Projeto → Usuários (Consultores & Cliente).
            </p>
          </div>
        </div>
      ) : (
        <div className="panel-head">
          <h2>Usuários, Convites e Clientes</h2>
          <p>
            Crie convites por e-mail, defina o perfil (cliente, consultor, gestor) e vincule aos clientes e projetos.
          </p>
        </div>
      )}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Clientes & Projetos</h2>
          <Link
            className="btn btn-sm"
            to="/settings/projects"
            style={{ flexShrink: 0 }}
          >
            + Criar Projeto
          </Link>
        </div>
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
              }}
            >
              {/* Client Header */}
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                onClick={() => setExpandedClient(isExpanded ? null : c.id)}
              >
                <div style={{ flex: 1 }}>
                  <div className="ticket-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.8rem" }}>{isExpanded ? "▼" : "▶"}</span>
                    <strong>{c.name}</strong>
                    {c.code ? (
                      <code className="mono" style={{ fontSize: "0.75rem", opacity: 0.6 }}>{c.code}</code>
                    ) : null}
                  </div>
                  <div className="ticket-meta">
                    {clientProjects.length} projeto(s) · {clientUsers.length} usuário(s) do cliente · {clientInvites.length} convite(s) pendente(s) · criado {formatDate(c.createdAt)}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded ? (
                <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                  
                  {/* Info Banner */}
                  <div className="ok-banner" style={{ marginBottom: "1rem", padding: "0.6rem 0.75rem", fontSize: "0.82rem", background: "#f0f4ff", border: "1px solid #c7d2fe", borderRadius: "6px", color: "#1e40af" }}>
                    <strong>&#128274; Regra de Vínculo de Projetos:</strong> Usuários do cliente com <strong>projetos associados</strong> enxergarão apenas esses projetos específicos no portal ao abrir chamado (`/tickets/new`). Se o usuário não tiver restrições individuais, ele herdará todos os projetos do cliente.
                  </div>

                  {/* Projetos do Cliente */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "var(--text)" }}>
                      1. Projetos & Equipes Vinculadas ({clientProjects.length})
                    </h4>
                    <Link
                      className="btn btn-sm btn-ghost"
                      to="/settings/projects"
                      style={{ fontSize: "0.8rem" }}
                    >
                      + Novo Projeto
                    </Link>
                  </div>
                  {clientProjects.length === 0 ? (
                    <p className="empty" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
                      Nenhum projeto cadastrado.{" "}
                      <Link to="/settings/projects" style={{ fontWeight: "600" }}>Criar projeto</Link> para este cliente.
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                      {clientProjects.map((p) => {
                        const projectLinks = getProjectUsers(p.id);
                        const isProjExpanded = expandedProject === p.id;
                        const availableCandidates = users.filter(
                          (u) => !projectLinks.some((l) => l.userId === u.id),
                        );

                        return (
                          <div
                            key={p.id}
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius-md)",
                              padding: "0.85rem",
                              background: "var(--surface)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                                  {p.name}{" "}
                                  <code className="mono" style={{ fontSize: "0.75rem", opacity: 0.7 }}>[{p.code}]</code>
                                </div>
                                <div className="muted" style={{ fontSize: "0.8rem", marginTop: "2px" }}>
                                  Faturamento: {p.billingModel === "per_hour" ? "Hora (T&M)" : p.billingModel === "per_ticket" ? "Por Ticket" : "Preço Fixo"} · Equipe: {projectLinks.length} usuário(s) associado(s)
                                </div>
                              </div>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => setExpandedProject(isProjExpanded ? null : p.id)}
                              >
                                {isProjExpanded ? "Ocultar Equipe ▲" : "Gerenciar Equipe ▼"}
                              </button>
                            </div>

                            {/* Equipe do Projeto */}
                            {isProjExpanded ? (
                              <div style={{ marginTop: "0.75rem", borderTop: "1px dashed var(--border)", paddingTop: "0.75rem" }}>
                                <h5 style={{ margin: "0 0 0.5rem 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                  Usuários com Acesso ao Projeto [{p.code}]
                                </h5>

                                {projectLinks.length === 0 ? (
                                  <p className="muted" style={{ fontSize: "0.8rem", margin: "0 0 0.5rem 0" }}>
                                    Nenhum usuário restrito individualmente. Usuários do cliente herdam acesso por padrão.
                                  </p>
                                ) : (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}>
                                    {projectLinks.map((l) => {
                                      const u = l.user;
                                      if (!u) return null;
                                      const isClientRole = u.role === "cliente";

                                      return (
                                        <span
                                          key={l.id}
                                          className="tag-pill"
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.4rem",
                                            background: isClientRole ? "rgba(59, 130, 246, 0.1)" : "rgba(16, 185, 129, 0.1)",
                                            color: isClientRole ? "var(--primary)" : "#059669",
                                            borderColor: isClientRole ? "rgba(59, 130, 246, 0.3)" : "rgba(16, 185, 129, 0.3)",
                                            padding: "3px 8px",
                                            fontSize: "0.8rem",
                                          }}
                                        >
                                          <strong>{u.name}</strong> ({roleLabel(u.role as UserRole)})
                                          <button
                                            style={{
                                              background: "none",
                                              border: "none",
                                              color: "inherit",
                                              cursor: "pointer",
                                              fontWeight: "bold",
                                              marginLeft: "4px",
                                              padding: 0,
                                            }}
                                            title="Remover do projeto"
                                            disabled={linking}
                                            onClick={() => void handleUnlinkUser(p.id, u.id)}
                                          >
                                            ✕
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Selector de associacao */}
                                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
                                  <select
                                    style={{ fontSize: "0.82rem", padding: "0.3rem 0.5rem", flex: 1, maxWidth: "320px" }}
                                    value={selectedUserToAdd[p.id] || ""}
                                    onChange={(e) =>
                                      setSelectedUserToAdd((prev) => ({ ...prev, [p.id]: e.target.value }))
                                    }
                                  >
                                    <option value="">-- Associar Consultor ou Usuário Cliente --</option>
                                    {availableCandidates.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.name} ({roleLabel(u.role)}) {u.clientId ? ` - ${clients.find((cl) => cl.id === u.clientId)?.name ?? ""}` : ""}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    className="btn btn-sm"
                                    disabled={!selectedUserToAdd[p.id] || linking}
                                    onClick={() => void handleLinkUser(p.id, selectedUserToAdd[p.id]!)}
                                  >
                                    + Associar
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Usuários do Cliente */}
                  <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", fontWeight: 600, color: "var(--text)" }}>
                    2. Usuários do Cliente ({clientUsers.length})
                  </h4>
                  {clientUsers.length === 0 ? (
                    <p className="empty" style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
                      Nenhum usuário cadastrado. Use o formulário abaixo para convidar.
                    </p>
                  ) : (
                    <div className="data-table-wrap" style={{ marginBottom: "1.5rem" }}>
                      <table className="data-table" style={{ fontSize: "0.82rem" }}>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>E-mail</th>
                            <th>Projetos Vinculados</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clientUsers.map((u) => {
                            const uLinks = getUserProjectLinks(u.id);

                            return (
                              <tr key={u.id}>
                                <td style={{ fontWeight: "500" }}>
                                  {u.name}
                                  {u.id === user?.id ? " (você)" : ""}
                                </td>
                                <td className="mono table-meta">{u.email}</td>
                                <td>
                                  {uLinks.length === 0 ? (
                                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                                      Todos os Projetos do Cliente (Padrão)
                                    </span>
                                  ) : (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                                      {uLinks.map((l) => (
                                        <span key={l.id} className="badge badge-em_andamento" style={{ fontSize: "0.72rem" }}>
                                          {l.project?.code ?? l.projectId}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pending Invites */}
                  {clientInvites.length > 0 ? (
                    <>
                      <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", fontWeight: 600, color: "var(--text-muted)" }}>
                        3. Convites Pendentes ({clientInvites.length})
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
          {users.map((u) => {
            const uLinks = getUserProjectLinks(u.id);

            return (
              <li key={u.id} className="ticket-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                {uLinks.length > 0 ? (
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    {uLinks.map((l) => (
                      <span key={l.id} className="badge badge-em_andamento" style={{ fontSize: "0.72rem" }}>
                        {l.project?.code ?? l.projectId}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
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
