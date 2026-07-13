import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  getSettings,
  patchPortalKbSettings,
  type StaffSettingsResponse,
} from "../../lib/api";

export function PortalSettingsPage() {
  const [data, setData] = useState<StaffSettingsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEdit = data?.canEdit ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      setData(res);
      setEnabled(res.settings.knowledgeBaseEnabled ?? false);
      setUrl(res.settings.knowledgeBaseUrl ?? "");
      setHeroTitle(res.settings.portalHeroTitle ?? "");
      setHeroSubtitle(res.settings.portalHeroSubtitle ?? "");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o portal.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    if (enabled && !url.trim()) {
      setError("Informe a URL da base de conhecimento.");
      return;
    }
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await patchPortalKbSettings({
        knowledgeBaseEnabled: enabled,
        knowledgeBaseUrl: url.trim() ? url.trim() : null,
        portalHeroTitle: heroTitle.trim() ? heroTitle.trim() : null,
        portalHeroSubtitle: heroSubtitle.trim() ? heroSubtitle.trim() : null,
      });
      setData(res);
      setEnabled(res.settings.knowledgeBaseEnabled ?? false);
      setUrl(res.settings.knowledgeBaseUrl ?? "");
      setHeroTitle(res.settings.portalHeroTitle ?? "");
      setHeroSubtitle(res.settings.portalHeroSubtitle ?? "");
      setOk("Portal cliente atualizado.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar portal.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="muted">Carregando portal…</p>;
  }

  const previewKbVisible = enabled && !!url.trim();
  const previewTitle = heroTitle.trim() || "Como podemos ajudar?";
  const previewSubtitle =
    heroSubtitle.trim() ||
    "Abra um chamado ou acompanhe os serviços da sua empresa.";

  return (
    <div>
      <div className="panel-head">
        <h2>Portal cliente</h2>
        <p>
          Hero, base de conhecimento e visão do menu do cliente.
          {!canEdit ? (
            <span className="muted"> Você tem acesso somente leitura.</span>
          ) : null}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-text">{ok}</p> : null}

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Hero da home</h3>

        <label className="field">
          <span>Título</span>
          <input
            type="text"
            value={heroTitle}
            onChange={(e) => setHeroTitle(e.target.value)}
            disabled={!canEdit}
            placeholder="Como podemos ajudar?"
            maxLength={120}
          />
        </label>

        <label className="field">
          <span>Subtítulo</span>
          <textarea
            value={heroSubtitle}
            onChange={(e) => setHeroSubtitle(e.target.value)}
            disabled={!canEdit}
            rows={2}
            maxLength={300}
            placeholder="Abra um chamado ou acompanhe os serviços da sua empresa."
          />
        </label>

        <hr style={{ margin: "1.25rem 0", border: 0, borderTop: "1px solid var(--border)" }} />

        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Exibir link da base de conhecimento no portal</span>
        </label>

        <label className="field">
          <span>URL da base de conhecimento</span>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!canEdit || !enabled}
            placeholder="https://docs.suaempresa.com.br"
          />
        </label>

        {canEdit ? (
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        ) : null}
      </form>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <h3>Preview — hero e menu</h3>
        <div style={{ marginBottom: "1rem" }}>
          <p style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            {previewTitle}
          </p>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            {previewSubtitle}
          </p>
        </div>
        <nav className="settings-portal-preview" aria-label="Preview menu cliente">
          <span className="settings-portal-preview-link">Início</span>
          <span className="settings-portal-preview-link">Meus chamados</span>
          {previewKbVisible ? (
            <a
              href={url}
              className="settings-portal-preview-link active"
              target="_blank"
              rel="noopener noreferrer"
            >
              Base de conhecimento ↗
            </a>
          ) : (
            <span className="settings-portal-preview-link muted">
              Base de conhecimento (oculto)
            </span>
          )}
        </nav>
      </div>
    </div>
  );
}
