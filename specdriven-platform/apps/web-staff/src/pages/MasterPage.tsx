import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Organization, UserRole } from "@specdriven/shared";
import {
  ApiError,
  createOrgUser,
  createOrganization,
  listOrganizations,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/labels";

const STAFF_ROLES: UserRole[] = ["admin", "gestor", "consultor"];

export function MasterPage() {
  const { user, switchOrg } = useAuth();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("admin");
  const [creatingUser, setCreatingUser] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOrganizations();
      setOrganizations(res.organizations);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar consultorias.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (user?.role !== "master") {
    return <p className="error">Acesso restrito ao usuário master.</p>;
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    setOk(null);
    try {
      const { organization } = await createOrganization(name.trim());
      setOrganizations((prev) =>
        [...prev, organization].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setOk(`Consultoria "${organization.name}" criada.`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível criar a consultoria.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function onEnter(org: Organization) {
    setEnteringId(org.id);
    setError(null);
    try {
      await switchOrg(org.id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível entrar na consultoria.",
      );
    } finally {
      setEnteringId(null);
    }
  }

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    if (!userOrgId || !userEmail.trim() || !userName.trim() || !userPassword) {
      return;
    }
    setCreatingUser(true);
    setError(null);
    setOk(null);
    try {
      await createOrgUser(userOrgId, {
        email: userEmail.trim(),
        name: userName.trim(),
        password: userPassword,
        role: userRole,
      });
      setOk(`Usuário ${userEmail.trim()} criado.`);
      setUserEmail("");
      setUserName("");
      setUserPassword("");
      setUserRole("admin");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível criar o usuário.",
      );
    } finally {
      setCreatingUser(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Plataforma SpecDriven</p>
          <h1 className="page-title-serif">Console da plataforma</h1>
          <p>
            Gerencie consultorias clientes da plataforma. Entre em uma consultoria
            para operar chamados e configurações.
          </p>
        </div>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok">{ok}</p> : null}

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Nova consultoria</h2>
        <form onSubmit={onCreate} className="form-row">
          <label>
            Nome
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Acme Consultoria"
              required
            />
          </label>
          <button type="submit" className="btn" disabled={creating}>
            {creating ? "Criando…" : "Criar"}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Consultorias cadastradas</h2>
        {organizations.length === 0 && !loading ? (
          <p className="muted">Nenhuma consultoria cadastrada.</p>
        ) : (
          <ul className="master-org-list">
            {organizations.map((org) => (
              <li key={org.id} className="master-org-row">
                <div>
                  <strong>{org.name}</strong>
                  {org.isMasterConsultancy ? (
                    <span className="muted"> — operador plataforma</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={enteringId === org.id}
                  onClick={() => void onEnter(org)}
                >
                  {enteringId === org.id ? "Entrando…" : "Entrar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Novo usuário em consultoria</h2>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Crie o Master da consultoria (<code>admin</code>) ou outros papéis staff.
        </p>
        <form onSubmit={onCreateUser} className="form">
          <label>
            Consultoria
            <select
              value={userOrgId ?? ""}
              onChange={(e) => setUserOrgId(e.target.value || null)}
              required
            >
              <option value="">Selecione…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nome
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha inicial
            <input
              type="password"
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <label>
            Papel
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value as UserRole)}
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role === "admin" ? "Master da consultoria (admin)" : roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn" disabled={creatingUser}>
            {creatingUser ? "Criando…" : "Criar usuário"}
          </button>
        </form>
      </section>
    </>
  );
}
