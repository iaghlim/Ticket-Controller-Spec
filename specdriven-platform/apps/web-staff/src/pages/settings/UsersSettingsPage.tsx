import { Link } from "react-router-dom";

export function UsersSettingsPage() {
  return (
    <div>
      <div className="panel-head">
        <h2>Usuários e convites</h2>
        <p>
          Convites de acesso ao portal (clientes e equipe) são gerenciados na
          página de clientes.
        </p>
      </div>

      <div className="panel">
        <p className="muted">
          Crie convites por e-mail, defina o perfil (cliente, consultor, gestor)
          e vincule ao cliente quando aplicável.
        </p>
        <div className="form-actions">
          <Link to="/clients" className="btn">
            Ir para Clientes e convites
          </Link>
        </div>
      </div>
    </div>
  );
}
