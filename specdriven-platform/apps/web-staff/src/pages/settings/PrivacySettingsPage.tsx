import { useState } from "react";
import { ApiError, exportPrivacyData } from "../../lib/api";

export function PrivacySettingsPage() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    setExporting(true);
    setError(null);
    setOk(null);
    try {
      const data = await exportPrivacyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `specdriven-dados-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setOk("Exportação concluída. O arquivo JSON foi baixado.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao exportar seus dados.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="panel-head">
        <h2>Privacidade (LGPD)</h2>
        <p>
          Exporte uma cópia dos seus dados pessoais armazenados na plataforma.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-text">{ok}</p> : null}

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Exportar meus dados</h3>
        <p className="muted">
          Gera um arquivo JSON com perfil, comentários, apontamentos de horas e
          notificações vinculados à sua conta.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => void onExport()}
          >
            {exporting ? "Exportando…" : "Baixar JSON"}
          </button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Exclusão de conta</h3>
        <p className="muted">
          Para solicitar a anonimização ou exclusão dos seus dados pessoais,
          entre em contato com o gestor da consultoria ou o e-mail de suporte
          configurado no perfil da organização.
        </p>
        <p className="muted">
          A exclusão via API (<code>POST /privacy/delete</code>) remove dados
          identificáveis mantendo registros operacionais anonimizados, conforme
          política interna.
        </p>
      </div>
    </div>
  );
}
