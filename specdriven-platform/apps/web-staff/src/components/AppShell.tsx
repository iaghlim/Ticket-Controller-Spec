import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { listApprovals, listTickets } from "../lib/api";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/labels";
import { StaffSearch } from "./StaffSearch";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
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

function IconTickets() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconQueue() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M6 12h12M8 18h8" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
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

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [myQueueCount, setMyQueueCount] = useState<number | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [ticketsRes, approvalsRes] = await Promise.all([
          listTickets(),
          listApprovals({ status: "pending" }),
        ]);
        if (cancelled || !user) return;
        const open = ticketsRes.tickets.filter(
          (t) => t.status !== "concluido" && t.status !== "cancelado",
        );
        setTicketCount(open.length);
        setMyQueueCount(
          open.filter((t) => t.assigneeId === user.id).length,
        );
        setPendingApprovals(approvalsRes.approvals.length);
      } catch {
        /* ignore nav badge errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

  const displayName = user?.name ?? user?.email ?? "Usuário";
  const roleText =
    user?.role === "gestor"
      ? "Gestora de operações"
      : user?.role === "master"
        ? "Master da plataforma"
        : user?.role
          ? roleLabel(user.role)
          : "";

  return (
    <div className="app-layout">
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">SD</div>
          <div>
            <strong>
              Spec<span>Driven</span>
            </strong>
            <small>IT service management</small>
          </div>
        </div>

        <p className="nav-section-label">Operação</p>
        <ul className="nav-list">
          <li>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}`
              }
            >
              <IconDashboard />
              Visão geral
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tickets"
              end={false}
              className={({ isActive }) => {
                const mine = location.search.includes("mine");
                return `nav-item${isActive && !mine && location.pathname === "/tickets" ? " active" : ""}`;
              }}
            >
              <IconTickets />
              Chamados
              {ticketCount != null ? (
                <span className="nav-badge">{ticketCount}</span>
              ) : null}
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tickets?mine=1"
              className={() =>
                `nav-item${location.pathname === "/tickets" && location.search.includes("mine") ? " active" : ""}`
              }
            >
              <IconQueue />
              Minha fila
              {myQueueCount != null ? (
                <span className="nav-badge">{myQueueCount}</span>
              ) : null}
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/approvals"
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}`
              }
            >
              <IconClipboard />
              Aprovação de horas
              {pendingApprovals != null ? (
                <span className="nav-badge">{pendingApprovals}</span>
              ) : null}
            </NavLink>
          </li>
        </ul>

        <p className="nav-section-label" style={{ marginTop: "1.75rem" }}>
          Gestão
        </p>
        <ul className="nav-list">
          <li>
            <NavLink
              to="/clients"
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}`
              }
            >
              <IconBuilding />
              Clientes
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/reports"
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}`
              }
            >
              <IconChart />
              Relatórios
            </NavLink>
          </li>
          {user?.role === "master" ? (
            <li>
              <NavLink
                to="/master"
                className={({ isActive }) =>
                  `nav-item${isActive ? " active" : ""}`
                }
              >
                <IconBuilding />
                Consultorias
              </NavLink>
            </li>
          ) : null}
        </ul>

        <div className="sidebar-footer">
          <button type="button" className="nav-item" disabled style={{ opacity: 0.5, cursor: "default" }}>
            Configurações
          </button>
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials(displayName)}</div>
            <div className="sidebar-user-info">
              <strong>{displayName}</strong>
              <span>{roleText}</span>
            </div>
          </div>
          <button
            type="button"
            className="nav-item"
            style={{ marginTop: "0.5rem" }}
            onClick={logout}
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="content-header">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <IconMenu />
          </button>
          <StaffSearch />
          <div className="header-actions">
            <Link to="/approvals" className="icon-btn" aria-label="Notificações">
              <IconBell />
              {pendingApprovals != null && pendingApprovals > 0 ? (
                <span className="icon-btn-dot" />
              ) : null}
            </Link>
            <Link className="btn btn-sm" to="/tickets/new">
              <IconPlus />
              Novo chamado
            </Link>
          </div>
        </header>
        <main className="content-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
