import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/settings", label: "Visão geral", end: true },
  { to: "/settings/organization", label: "Perfil da organização", end: false },
  { to: "/settings/sla", label: "SLA", end: false },
  { to: "/settings/billing", label: "Baseline", end: false },
  { to: "/settings/catalog", label: "Catálogo", end: false },
  { to: "/settings/projects", label: "Projetos", end: false },
  { to: "/settings/users", label: "Usuários", end: false },
  { to: "/settings/email", label: "E-mail", end: false },
  { to: "/settings/notifications", label: "Notificações", end: false },
  { to: "/settings/portal", label: "Portal cliente", end: false },
  { to: "/settings/audit", label: "Audit log", end: false },
  { to: "/settings/privacy", label: "Privacidade", end: false },
] as const;

export function SettingsLayout() {
  return (
    <div className="settings-layout">
      <header className="settings-header">
        <h1>Configurações</h1>
        <p className="muted">
          Como a consultoria se apresenta ao cliente e parâmetros operacionais.
        </p>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Configurações">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `settings-nav-link${isActive ? " active" : ""}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
