import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Organization } from "@specdriven/shared";
import {
  ApiError,
  createOrganization,
  listOrganizations,
} from "../lib/api";
import { useAuth } from "../lib/auth";

export function MasterPage() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Plataforma</p>
          <h1 className="page-title-serif">Consultorias</h1>
          <p>Cadastre novas consultorias na plataforma.</p>
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

      <section className="card">
        <h2>Consultorias cadastradas</h2>
        {organizations.length === 0 && !loading ? (
          <p className="muted">Nenhuma consultoria além da master.</p>
        ) : (
          <ul>
            {organizations.map((org) => (
              <li key={org.id}>
                <strong>{org.name}</strong>
                {org.isMasterConsultancy ? (
                  <span className="muted"> — master</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
