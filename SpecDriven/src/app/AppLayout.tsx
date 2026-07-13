import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useCloudAuth } from "../shared/cloud-auth";
import { useWorkspace } from "../shared/workspace";
import { SearchPalette } from "../features/search/SearchPalette";
import { api, errorMessage } from "../shared/api";
import type { ActiveTimerView } from "../shared/types";

function formatShort(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 3v18h18M7 16V9M12 16V5M17 16v-7" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function AppLayout() {
  const { loading, error, refresh, tree } = useWorkspace();
  const { user, isCloudMode } = useCloudAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState<ActiveTimerView | null>(null);
  const showBack = location.pathname !== "/";

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  const refreshTimer = useCallback(async () => {
    try {
      setActive(await api.getActiveTimer());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshTimer();
    const id = setInterval(() => void refreshTimer(), 2000);
    return () => clearInterval(id);
  }, [refreshTimer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ticketCount = tree?.tickets.length ?? 0;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">SD</div>
          <div>
            <strong>
              Spec<span>Driven</span>
            </strong>
            <small>Desktop workspace</small>
          </div>
        </div>

        <p className="nav-section-label">Navegação</p>
        <nav className="stack" style={{ gap: "0.15rem" }}>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to="/"
            end
          >
            <IconDashboard />
            Dashboard
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to="/clientes"
          >
            <IconBuilding />
            Clientes
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to="/relatorios/chamados"
          >
            <IconChart />
            Relatório
            {ticketCount > 0 ? (
              <span className="mono" style={{ marginLeft: "auto", fontSize: "0.625rem", opacity: 0.75 }}>
                {ticketCount}
              </span>
            ) : null}
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            to="/configuracoes"
          >
            <IconSettings />
            Configurações
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {isCloudMode && user ? (
            <div className="sidebar-cloud-user">Cloud: {user.name}</div>
          ) : null}

          {active ? (
            <div className="timer-indicator">
              <span className={`dot ${active.status === "running" ? "on" : ""}`} />
              <span className="mono">{active.key}</span>
              <span className="muted">{formatShort(active.elapsedSecs)}</span>
            </div>
          ) : null}

          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try {
                await api.showTimerOverlay();
              } catch (e) {
                alert(errorMessage(e));
              }
            }}
          >
            Overlay timer
          </button>
          <button type="button" className="btn" onClick={() => setSearchOpen(true)}>
            Buscar (Ctrl+K)
          </button>
          <button type="button" className="btn" onClick={() => void refresh()}>
            Atualizar scan
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="content-header">
          <div className="row" style={{ gap: "0.65rem", minWidth: 0, flex: 1 }}>
            {showBack ? (
              <>
                <button
                  type="button"
                  className="btn btn-back"
                  onClick={goBack}
                  aria-label="Voltar"
                  title="Voltar"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn btn-back"
                  onClick={() => navigate("/")}
                  aria-label="Início"
                  title="Início"
                >
                  ⌂
                </button>
              </>
            ) : null}
            <div
              className="muted mono"
              style={{ fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {tree?.rootPath || "Sem raiz"}
            </div>
          </div>
          <div className="row" style={{ gap: "0.5rem", flexShrink: 0 }}>
            {active ? (
              <span className="badge ok">
                Timer {active.status === "running" ? "ativo" : "pausado"}: {active.key}
              </span>
            ) : null}
            <span className="muted" style={{ fontSize: "0.8125rem" }}>
              {loading ? "Carregando…" : `${ticketCount} chamados`}
            </span>
          </div>
        </header>

        <main className="content-body">
          {error ? (
            <div className="error-banner" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
