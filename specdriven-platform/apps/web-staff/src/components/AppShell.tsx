import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { listApprovals, listTickets } from "../lib/api";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/labels";
import { isActingMaster, isPlatformMaster } from "../lib/session";
import { NotificationBell } from "./NotificationBell";
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

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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

function IconProblem() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconChange() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
  const { user, logout, exitOrg } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ticketCount, setTicketCount] = useState<number | null>(null);
  const [myQueueCount, setMyQueueCount] = useState<number | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [exiting, setExiting] = useState(false);

  const platformMode = isPlatformMaster(user);
  const actingMaster = isActingMaster(user);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (platformMode) return;
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
  }, [user, location.pathname, platformMode]);

  const displayName = user?.name ?? user?.email ?? "Usuário";
  const roleText =
    user?.role === "gestor"
      ? "Gestora de operações"
      : user?.role === "master"
        ? platformMode
          ? "Master da plataforma"
          : "Master da plataforma (em consultoria)"
        : user?.role === "admin"
          ? "Master da consultoria"
          : user?.role
            ? roleLabel(user.role)
            : "";

  async function onExitToPlatform() {
    setExiting(true);
    try {
      await exitOrg();
      navigate("/master", { replace: true });
    } finally {
      setExiting(false);
    }
  }

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

        <p className="nav-section-label">
          {platformMode ? "Plataforma" : "Operação"}
        </p>
        <ul className="nav-list">
          {platformMode ? (
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
          ) : (
            <>
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
              <li>
                <NavLink
                  to="/problems"
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}`
                  }
                >
                  <IconProblem />
                  Problemas
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/changes"
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}`
                  }
                >
                  <IconChange />
                  Mudanças
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/risks"
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}`
                  }
                >
                  <IconShield />
                  Risks (Matriz de Riscos)
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/knowledge"
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}`
                  }
                >
                  <IconBook />
                  Base de Conhecimento
                </NavLink>
              </li>
            </>
          )}
        </ul>

        {!platformMode ? (
          <>
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
                  to="/settings/projects"
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}`
                  }
                >
                  <IconBuilding />
                  Projetos
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
              <li>
                <NavLink
                  to="/reports/health"
                  className={({ isActive }) =>
                    `nav-item${isActive ? " active" : ""}`
                  }
                >
                  <IconChart />
                  Saúde do Serviço
                </NavLink>
              </li>
            </ul>
          </>
        ) : null}

        <div className="sidebar-footer">
          {!platformMode ? (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-item${isActive ? " active" : ""}`
              }
            >
              <IconSettings />
              Configurações
            </NavLink>
          ) : null}
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
        {actingMaster ? (
          <div className="platform-context-banner">
            <span>
              Atuando em: <strong>{user?.organizationName}</strong>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={exiting}
              onClick={() => void onExitToPlatform()}
            >
              {exiting ? "Saindo…" : "Sair para console"}
            </button>
          </div>
        ) : null}
        <header className="content-header">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <IconMenu />
          </button>
          {!platformMode ? <StaffSearch /> : <div className="header-spacer" />}
          <div className="header-actions">
            {!platformMode ? (
              <>
                <NotificationBell refreshKey={location.pathname} />
                <Link className="btn btn-sm" to="/tickets/new">
                  <IconPlus />
                  Novo chamado
                </Link>
              </>
            ) : null}
          </div>
        </header>
        <main className="content-body">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
