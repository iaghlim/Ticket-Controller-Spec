import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useClientContext } from "../lib/useClientContext";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function IconCommand() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="login-wrap">
        <p className="muted">Carregando sessão…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  return <Outlet />;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { clientName } = useClientContext();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const displayName = clientName || user?.name || user?.email || "Cliente";

  return (
    <div className="client-layout">
      <header className="client-header">
        <div className="client-header-inner">
          <div className="client-brand">
            <div className="client-brand-mark">
              <IconCommand />
            </div>
            <div>
              <p className="client-brand-title">
                Spec<span>Driven</span>
              </p>
              <p className="client-brand-sub">portal do cliente</p>
            </div>
          </div>

          <button
            type="button"
            className="client-menu-toggle"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <IconClose /> : <IconMenu />}
          </button>

          <nav className={`client-nav${menuOpen ? " open" : ""}`}>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `client-nav-link${isActive ? " active" : ""}`
              }
            >
              Início
            </NavLink>
            <NavLink
              to="/tickets"
              className={({ isActive }) =>
                `client-nav-link${isActive ? " active" : ""}`
              }
            >
              Meus chamados
            </NavLink>
            <button type="button" className="client-nav-link" disabled>
              Base de conhecimento
            </button>
            <button
              type="button"
              className="client-nav-link client-nav-logout"
              onClick={logout}
            >
              Sair
            </button>
          </nav>

          <div className="client-header-actions">
            <button type="button" className="icon-btn" aria-label="Notificações" disabled>
              <IconBell />
              <span className="icon-btn-dot" />
            </button>
            <div className="client-user">
              <div className="client-user-avatar">{initials(displayName)}</div>
              <span className="client-user-name">{displayName}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm client-logout" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="client-main">
        <div className="client-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
