import { useEffect, useState } from "react";
import { api, errorMessage } from "../../shared/api";
import type { Snippet } from "../../shared/types";

type FieldDef = { key: string; label: string; multiline?: boolean };

export function SnippetsPanel({
  multilineFields,
  focusedField,
  onInsert,
}: {
  multilineFields: FieldDef[];
  focusedField: string | null;
  onInsert: (fieldKey: string, text: string) => void;
}) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [targetField, setTargetField] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.getSnippets();
        setSnippets(res.snippets);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (focusedField && multilineFields.some((f) => f.key === focusedField)) {
      setTargetField(focusedField);
    } else if (!targetField && multilineFields.length > 0) {
      setTargetField(multilineFields[0].key);
    }
  }, [focusedField, multilineFields, targetField]);

  async function persist(next: Snippet[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.saveSnippets(next);
      setSnippets(res.snippets);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function insertSnippet(snippet: Snippet) {
    const field = focusedField ?? targetField;
    if (!field) {
      setError("Selecione um campo de destino.");
      return;
    }
    onInsert(field, snippet.body);
  }

  async function addSnippet() {
    const title = newTitle.trim();
    const body = newBody.trim();
    if (!title || !body) {
      setError("Informe título e conteúdo do snippet.");
      return;
    }
    const next = [
      ...snippets,
      { id: crypto.randomUUID(), title, body },
    ];
    await persist(next);
    setNewTitle("");
    setNewBody("");
    setShowAdd(false);
  }

  async function deleteSnippet(id: string) {
    if (!confirm("Excluir este snippet?")) return;
    await persist(snippets.filter((s) => s.id !== id));
  }

  return (
    <aside className="snippets-panel panel stack">
      <h3>Snippets</h3>
      <p className="page-sub">
        Textos reutilizáveis do workspace. Clique em um campo multilinha e insira.
      </p>

      {error && <div className="error-banner">{error}</div>}

      {!focusedField && multilineFields.length > 0 && (
        <div className="field">
          <label>Inserir em</label>
          <select
            value={targetField}
            onChange={(e) => setTargetField(e.target.value)}
          >
            {multilineFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {focusedField && (
        <p className="snippets-hint">
          Campo ativo:{" "}
          <strong>
            {multilineFields.find((f) => f.key === focusedField)?.label ??
              focusedField}
          </strong>
        </p>
      )}

      <ul className="snippets-list">
        {snippets.map((s) => (
          <li key={s.id} className="snippets-item">
            <div className="snippets-item-head">
              <span className="snippets-title">{s.title}</span>
              <div className="row">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => insertSnippet(s)}
                >
                  Inserir
                </button>
                <button
                  className="btn btn-danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteSnippet(s.id)}
                >
                  ×
                </button>
              </div>
            </div>
            <pre className="snippets-preview">{s.body}</pre>
          </li>
        ))}
      </ul>

      {snippets.length === 0 && (
        <p className="page-sub">Nenhum snippet salvo.</p>
      )}

      {showAdd ? (
        <div className="stack">
          <div className="field">
            <label>Título</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex.: Critérios de aceite"
            />
          </div>
          <div className="field">
            <label>Conteúdo</label>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              rows={5}
            />
          </div>
          <div className="row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void addSnippet()}
            >
              Salvar snippet
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setShowAdd(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => setShowAdd(true)}
        >
          + Novo snippet
        </button>
      )}
    </aside>
  );
}
