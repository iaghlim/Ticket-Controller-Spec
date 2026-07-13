import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Tag } from "@specdriven/shared";
import {
  ApiError,
  createTag,
  deleteTag,
  listTags,
  patchTag,
} from "../lib/api";
import { formatDate } from "../lib/labels";

const PRESET_COLORS = [
  "#bd1f2d",
  "#3e5747",
  "#d77a45",
  "#82758a",
  "#2563eb",
  "#7c3aed",
];

type TagsSectionProps = {
  readOnly?: boolean;
};

export function TagsSection({ readOnly = false }: TagsSectionProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTags();
      setTags(res.tags);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar tags.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(tag: Tag) {
    if (readOnly) return;
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color ?? PRESET_COLORS[0]!);
    setVisibleToClient(tag.visibleToClient ?? false);
    setOk(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setName("");
    setColor(PRESET_COLORS[0]!);
    setVisibleToClient(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || !name.trim()) return;
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (editingId) {
        const { tag } = await patchTag(editingId, {
          name: name.trim(),
          color: color || null,
          visibleToClient,
        });
        setTags((prev) =>
          prev
            .map((t) => (t.id === tag.id ? tag : t))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setOk("Tag atualizada.");
      } else {
        const { tag } = await createTag({
          name: name.trim(),
          color: color || null,
          visibleToClient,
        });
        setTags((prev) =>
          [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setOk("Tag criada.");
      }
      cancelEdit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao salvar tag.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (readOnly) return;
    if (!window.confirm("Excluir esta tag? Ela será removida dos chamados.")) {
      return;
    }
    setDeletingId(id);
    setError(null);
    setOk(null);
    try {
      await deleteTag(id);
      setTags((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) cancelEdit();
      setOk("Tag excluída.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao excluir tag.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="catalog-tags-section">
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-banner">{ok}</p> : null}

      {!readOnly ? (
        <div className="panel">
          <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            {editingId ? "Editar tag" : "Nova tag"}
          </h3>
          <form className="form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="tagName">Nome</label>
              <input
                id="tagName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={64}
              />
            </div>
            <div className="field">
              <label>Cor</label>
              <div className="tag-color-picker">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`tag-color-swatch${color === c ? " selected" : ""}`}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
                    onClick={() => setColor(c)}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Cor personalizada"
                  className="tag-color-input"
                />
              </div>
            </div>
            <label className="field catalog-type-item" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={visibleToClient}
                onChange={(e) => setVisibleToClient(e.target.checked)}
              />
              <span>Visível ao cliente no portal</span>
            </label>
            <div className="form-actions">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? "Salvando…" : editingId ? "Atualizar" : "Criar"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={cancelEdit}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-section-head">
          <div>
            <h3>Tags da organização</h3>
            <p>{tags.length} etiqueta(s) cadastrada(s)</p>
          </div>
        </div>
        {loading ? (
          <p className="muted" style={{ padding: "1rem" }}>
            Carregando…
          </p>
        ) : null}
        {!loading && tags.length === 0 ? (
          <p className="empty">Nenhuma tag cadastrada.</p>
        ) : null}
        {!loading && tags.length > 0 ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Cliente</th>
                  <th>Criada em</th>
                  {!readOnly ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id}>
                    <td>
                      <span
                        className="tag-pill"
                        style={
                          tag.color
                            ? {
                                background: `${tag.color}22`,
                                color: tag.color,
                                borderColor: `${tag.color}55`,
                              }
                            : undefined
                        }
                      >
                        {tag.name}
                      </span>
                    </td>
                    <td>
                      {tag.visibleToClient ? (
                        <span className="settings-status-pill ok">Sim</span>
                      ) : (
                        <span className="muted">Não</span>
                      )}
                    </td>
                    <td className="table-meta">{formatDate(tag.createdAt)}</td>
                    {!readOnly ? (
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => startEdit(tag)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={deletingId === tag.id}
                            onClick={() => void onDelete(tag.id)}
                          >
                            {deletingId === tag.id ? "…" : "Excluir"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TagsPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title-serif">Catálogo de tags.</h1>
          <p>Etiquetas reutilizáveis para classificar chamados.</p>
        </div>
      </div>
      <TagsSection />
    </>
  );
}
