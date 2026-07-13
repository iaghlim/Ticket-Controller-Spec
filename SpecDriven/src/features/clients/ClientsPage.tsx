import { useState } from "react";
import { Link } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../../shared/api";
import { useWorkspace } from "../../shared/workspace";
import { Modal } from "../../shared/components/ui";

export function ClientsPage() {
  const { tree, refresh } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameFrom, setRenameFrom] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError("Informe o nome do cliente.");
      return;
    }
    setError(null);
    setCreateError(null);
    setCreateBusy(true);
    try {
      await api.createClient(trimmed);
      setCreateOpen(false);
      setName("");
      setMsg("Cliente criado.");
      await refresh();
    } catch (e) {
      const message = errorMessage(e);
      setCreateError(message);
      setError(message);
    } finally {
      setCreateBusy(false);
    }
  }

  async function rename() {
    if (!renameFrom) return;
    setError(null);
    try {
      await api.renameClient(renameFrom, renameTo);
      setRenameFrom(null);
      setRenameTo("");
      setMsg("Cliente renomeado.");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setError(null);
    try {
      await api.deleteClient(deleteTarget, confirmName);
      setDeleteTarget(null);
      setConfirmName("");
      setMsg("Cliente excluído.");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function importZip(client: string) {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "ZIP", extensions: ["zip"] }],
        title: "Importar chamado (.zip)",
      });
      if (!selected || Array.isArray(selected)) return;
      const detail = await api.importTicketZip(selected, client);
      setMsg(`Chamado ${detail.meta.key} importado.`);
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">Pastas de primeiro nível na raiz do workspace.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setCreateError(null);
            setCreateOpen(true);
          }}
        >
          Novo cliente
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {msg && <div className="success-banner">{msg}</div>}

      {(tree?.clients.length ?? 0) === 0 ? (
        <div className="empty">Nenhum cliente. Crie o primeiro.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Chamados</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {tree!.clients.map((c) => (
              <tr key={c.name}>
                <td>
                  <Link to={`/clientes/${encodeURIComponent(c.name)}`}>{c.name}</Link>
                </td>
                <td>{c.ticketCount}</td>
                <td className="row">
                  <Link className="btn" to={`/clientes/${encodeURIComponent(c.name)}`}>
                    Abrir
                  </Link>
                  <button
                    className="btn"
                    onClick={() => {
                      setRenameFrom(c.name);
                      setRenameTo(c.name);
                    }}
                  >
                    Renomear
                  </button>
                  <button className="btn" onClick={() => void importZip(c.name)}>
                    Importar ZIP
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      setDeleteTarget(c.name);
                      setConfirmName("");
                    }}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={createOpen}
        title="Novo cliente"
        onClose={() => {
          if (createBusy) return;
          setCreateOpen(false);
          setCreateError(null);
        }}
      >
        <div className="stack">
          <div className="field">
            <label>Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void create();
                }
              }}
              autoFocus
              disabled={createBusy}
            />
          </div>
          {createError && <div className="error-banner">{createError}</div>}
          <div className="row">
            <button
              className="btn btn-primary"
              disabled={createBusy}
              onClick={() => void create()}
            >
              {createBusy ? "Criando…" : "Criar"}
            </button>
            <button
              className="btn"
              disabled={createBusy}
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!renameFrom}
        title="Renomear cliente"
        onClose={() => setRenameFrom(null)}
      >
        <div className="stack">
          <div className="field">
            <label>Novo nome</label>
            <input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => void rename()}>
              Salvar
            </button>
            <button className="btn" onClick={() => setRenameFrom(null)}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        title="Excluir cliente"
        onClose={() => setDeleteTarget(null)}
      >
        <div className="stack">
          <p>
            Esta ação remove a pasta do cliente e todos os chamados. Digite{" "}
            <strong>{deleteTarget}</strong> para confirmar.
          </p>
          <div className="field">
            <label>Confirmação</label>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-danger" onClick={() => void remove()}>
              Excluir definitivamente
            </button>
            <button className="btn" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
