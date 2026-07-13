import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../../shared/api";
import type { SearchHit } from "../../shared/types";
import { STATUS_LABELS } from "../../shared/types";
import { Modal } from "../../shared/components/ui";

export function SearchPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void (async () => {
        if (!query.trim()) {
          setHits([]);
          return;
        }
        try {
          setHits(await api.search(query));
          setError(null);
        } catch (e) {
          setError(errorMessage(e));
        }
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <Modal open={open} title="Buscar chamado" onClose={onClose} wide>
      <div className="stack">
        <div className="field">
          <label>Chave, título, cliente, tag ou status</label>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite para buscar…"
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div>
          {hits.length === 0 && query.trim() && (
            <div className="empty">Nenhum resultado.</div>
          )}
          {hits.map((h) => (
            <button
              key={`${h.client}/${h.key}`}
              className="search-hit"
              onClick={() => {
                onClose();
                navigate(
                  `/chamados/${encodeURIComponent(h.client)}/${encodeURIComponent(h.key)}`,
                );
              }}
            >
              <div>
                <strong className="mono">{h.key}</strong> — {h.title}
              </div>
              <div className="muted">
                {h.client} · {STATUS_LABELS[h.status]} · {h.scoreHint}
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
