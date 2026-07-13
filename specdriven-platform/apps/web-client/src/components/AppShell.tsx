import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  ApiError,
  isStaffRole,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { NOT_CONFIGURED } from "../lib/labels";
import { formatDate } from "../lib/labels";
import { useClientContext } from "../lib/useClientContext";
import { usePortalSettings } from "../lib/usePortalSettings";

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
  const { user, loading, logout } = useAuth();
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

  if (isStaffRole(user.role)) {
    return (
      <div className="login-wrap">
        <div className="panel login-panel">
          <h1 style={{ marginTop: 0, fontSize: "1.25rem" }}>Acesso restrito</h1>
          <p className="error">Use o portal de consultoria.</p>
          <p className="muted">
            Sua conta ({user.email}) tem perfil de equipe interna e não pode
            acessar o portal do cliente.
          </p>
          <button type="button" className="btn btn-block" onClick={logout}>
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function ClientNotifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications({ limit: 30 });
      setItems(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar notificações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onOpen() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }

  async function onRead(n: NotificationRow) {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Non-blocking.
      }
    }
    if (n.href) {
      setOpen(false);
      if (n.href.startsWith("http")) {
        window.open(n.href, "_blank", "noopener,noreferrer");
      } else {
        window.location.assign(n.href);
      }
    }
  }

  async function onReadAll() {
    try {
      await markAllNotificationsRead();
      setItems((prev) =>
        prev.map((x) => ({
          ...x,
          readAt: x.readAt ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao marcar como lidas.",
      );
    }
  }

  return (
    <div className="client-notifications" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Notificações"
        aria-expanded={open}
        onClick={() => void onOpen()}
      >
        <IconBell />
        {unreadCount > 0 ? <span className="icon-btn-dot" aria-hidden /> : null}
      </button>
      {open ? (
        <div className="client-notifications-dropdown" role="menu">
          <div className="client-notifications-head">
            <strong>Notificações</strong>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void onReadAll()}
              >
                Marcar todas
              </button>
            ) : null}
          </div>
          {loading ? (
            <p className="muted client-notifications-hint">Carregando…</p>
          ) : null}
          {error ? (
            <p className="error client-notifications-hint">{error}</p>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="muted client-notifications-hint">
              Nenhuma notificação.
            </p>
          ) : null}
          {!loading && items.length > 0 ? (
            <ul className="client-notifications-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`client-notifications-item${n.readAt ? "" : " unread"}`}
                    onClick={() => void onRead(n)}
                  >
                    <span className="client-notifications-title">{n.title}</span>
                    {n.body ? (
                      <span className="client-notifications-body">{n.body}</span>
                    ) : null}
                    <span className="client-notifications-meta">
                      {formatDate(n.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { clientName } = useClientContext();
  const { settings: portalSettings } = usePortalSettings();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const displayName = clientName || user?.name || user?.email || "Cliente";
  const kbUrl =
    portalSettings?.knowledgeBaseEnabled && portalSettings.knowledgeBaseUrl
      ? portalSettings.knowledgeBaseUrl
      : null;

  return (
    <div className="client-layout">
      <header className="client-header">
        <div className="client-header-inner">
          <div className="client-brand">
            {portalSettings?.logoUrl ? (
              <img
                src={portalSettings.logoUrl}
                alt={portalSettings.organizationName}
                className="client-brand-logo"
                style={{ maxHeight: 40, maxWidth: 140, objectFit: "contain" }}
              />
            ) : (
              <div className="client-brand-mark">
                <IconCommand />
              </div>
            )}
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
            {kbUrl ? (
              <a
                href={kbUrl}
                className="client-nav-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                Base de conhecimento
              </a>
            ) : (
              <span className="client-nav-link client-nav-unconfigured">
                Base de conhecimento
                <small className="unconfigured-label">{NOT_CONFIGURED}</small>
              </span>
            )}
            <button
              type="button"
              className="client-nav-link client-nav-logout"
              onClick={logout}
            >
              Sair
            </button>
          </nav>

          <div className="client-header-actions">
            <ClientNotifications />
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

      {portalSettings?.supportEmail || portalSettings?.supportPolicyText ? (
        <footer className="client-support-footer">
          {portalSettings.supportEmail ? (
            <p>
              Dúvidas?{" "}
              <a href={`mailto:${portalSettings.supportEmail}`}>
                {portalSettings.supportEmail}
              </a>
            </p>
          ) : null}
          {portalSettings.supportPolicyText ? (
            <p className="client-support-policy">{portalSettings.supportPolicyText}</p>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
