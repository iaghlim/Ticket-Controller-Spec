import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  getSettings,
  patchOrganizationSettings,
  uploadOrganizationLogo,
  type StaffSettingsResponse,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";

export function OrganizationSettingsPage() {
  const { refreshUser } = useAuth();
  const [data, setData] = useState<StaffSettingsResponse | null>(null);
  const [name, setName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPolicyText, setSupportPolicyText] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const canEdit = data?.canEdit ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      setData(res);
      setName(res.organization.name);
      setSupportEmail(res.settings.supportEmail ?? "");
      setSupportPolicyText(res.settings.supportPolicyText ?? "");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o perfil.",
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
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await patchOrganizationSettings({
        name: name.trim(),
        supportEmail: supportEmail.trim() ? supportEmail.trim() : null,
        supportPolicyText: supportPolicyText.trim()
          ? supportPolicyText.trim()
          : null,
      });
      setData(res);
      setOk("Perfil salvo com sucesso.");
      await refreshUser();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar o perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onLogoUpload(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !logoFile) return;
    setUploadingLogo(true);
    setError(null);
    setOk(null);
    try {
      const res = await uploadOrganizationLogo(logoFile);
      setLogoUrl(res.logoUrl);
      setLogoFile(null);
      const input = document.getElementById(
        "org-logo-file",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
      setOk("Logo enviado com sucesso.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao enviar logo.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  if (loading) {
    return <p className="muted">Carregando perfil…</p>;
  }

  return (
    <div>
      <div className="panel-head">
        <h2>Perfil da organização</h2>
        <p>
          Nome e contato exibidos ao cliente no portal.
          {!canEdit ? (
            <span className="muted"> Você tem acesso somente leitura.</span>
          ) : null}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-text">{ok}</p> : null}

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <label className="field">
          <span>Nome exibido</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            required
            disabled={!canEdit}
            placeholder="Ex.: Blend IT Consultoria"
          />
        </label>

        <label className="field">
          <span>E-mail de suporte</span>
          <input
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            disabled={!canEdit}
            placeholder="suporte@suaempresa.com.br"
          />
          <small className="muted">
            Exibido ao cliente com link mailto. Recomendado para completar o
            perfil.
          </small>
        </label>

        <label className="field">
          <span>Política de atendimento (opcional)</span>
          <textarea
            value={supportPolicyText}
            onChange={(e) => setSupportPolicyText(e.target.value)}
            disabled={!canEdit}
            rows={3}
            maxLength={500}
            placeholder="Ex.: Atendimento em dias úteis, das 9h às 18h."
          />
          <small className="muted">
            Texto curto no rodapé do portal do cliente (2–3 linhas).
          </small>
        </label>

        {canEdit ? (
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        ) : null}
      </form>

      <form className="panel" onSubmit={(e) => void onLogoUpload(e)}>
        <h3 style={{ marginTop: 0 }}>Logo no portal cliente</h3>
        <p className="muted">
          PNG, JPEG ou WebP, até 2 MB. Exibido no cabeçalho do portal do cliente
          (requer storage S3/MinIO configurado).
        </p>
        {logoUrl ? (
          <div style={{ marginBottom: "1rem" }}>
            <img
              src={logoUrl}
              alt="Logo da organização"
              style={{ maxHeight: 64, maxWidth: 200, objectFit: "contain" }}
            />
          </div>
        ) : null}
        {canEdit ? (
          <>
            <label className="field">
              <span>Arquivo</span>
              <input
                id="org-logo-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
              {logoFile ? (
                <small className="muted">{logoFile.name}</small>
              ) : null}
            </label>
            <div className="form-actions">
              <button
                type="submit"
                className="btn"
                disabled={uploadingLogo || !logoFile}
              >
                {uploadingLogo ? "Enviando…" : "Enviar logo"}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}
