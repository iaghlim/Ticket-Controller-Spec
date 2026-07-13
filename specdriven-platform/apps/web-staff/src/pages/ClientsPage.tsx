import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Client, User, UserRole } from "@specdriven/shared";
import {
  ApiError,
  createClient,
  createInvite,
  listClients,
  listInvites,
  listUsers,
  type Invite,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, roleLabel } from "../lib/labels";

export function ClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title-serif">Clientes e usuários.</h1>
          <p>Cadastro de clientes, usuários da org e convites.</p>
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

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Lista</h2>
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && clients.length === 0 ? (
          <p className="empty">Nenhum cliente cadastrado.</p>
        ) : null}
        <ul className="ticket-list">
          {clients.map((c, i) => (
            <li
              key={c.id}
              className="ticket-row"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div>
                <div className="ticket-title">{c.name}</div>
                <div className="ticket-meta">
                  {c.code ? (
                    <span className="mono">{c.code}</span>
                  ) : (
                    "sem código"
                  )}{" "}
                  · criado {formatDate(c.createdAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

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

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Convidar usuário</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          E-mail via stub <code className="mono">MAIL_PROVIDER=log</code>. Aceite:{" "}
          <code className="mono">POST /invites/accept</code>.
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
          </div>
          {inviteRole === "cliente" ? (
            <div className="field">
              <label htmlFor="inviteClient">Cliente</label>
              <select
                id="inviteClient"
                value={inviteClientId}
                onChange={(e) => setInviteClientId(e.target.value)}
                required
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Usuários da org</h2>
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
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

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
                  {roleLabel(inv.role)} · expira {formatDate(inv.expiresAt)}
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
