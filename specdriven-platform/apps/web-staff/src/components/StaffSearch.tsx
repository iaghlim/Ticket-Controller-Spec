import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, search, type SearchTicketHit } from "../lib/api";
import { statusLabel } from "../lib/labels";

export function StaffSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTicketHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await search(q, { limit: 12 });
          setResults(res.tickets);
          setOpen(true);
        } catch (err) {
          setResults([]);
          setError(
            err instanceof ApiError ? err.message : "Busca indisponível.",
          );
          setOpen(true);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showDropdown = open && query.trim().length > 0;

  return (
    <div className="staff-search" ref={wrapRef}>
      <svg
        className="staff-search-icon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" />
      </svg>
      <input
        type="search"
        className="staff-search-input"
        placeholder="Buscar chamado, cliente ou pessoa"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-label="Buscar chamados"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        autoComplete="off"
      />
      {showDropdown && (
        <div className="staff-search-dropdown" role="listbox">
          {loading && <p className="muted staff-search-hint">Buscando…</p>}
          {!loading && error && (
            <p className="error staff-search-hint">{error}</p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="muted staff-search-hint">Nenhum chamado encontrado.</p>
          )}
          {!loading && !error && results.length > 0 && (
            <ul className="staff-search-list">
              {results.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/tickets/${t.key}`}
                    className="staff-search-hit"
                    role="option"
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="staff-search-hit-key">{t.key}</span>
                    <span className="staff-search-hit-title">{t.title}</span>
                    <span className="staff-search-hit-meta">
                      {statusLabel(t.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
