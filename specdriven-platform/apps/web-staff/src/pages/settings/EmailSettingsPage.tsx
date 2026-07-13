import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  getSettings,
  patchEmailSettings,
  postEmailTest,
  type StaffSettingsResponse,
} from "../../lib/api";

export function EmailSettingsPage() {
  const [data, setData] = useState<StaffSettingsResponse | null>(null);
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [footerText, setFooterText] = useState("");
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpPassSet, setSmtpPassSet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const canEdit = data?.canEdit ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      setData(res);
      setFromName(res.settings.emailFromName ?? "");
      setReplyTo(res.settings.emailReplyTo ?? "");
      setFooterText(res.settings.emailFooterText ?? "");
      setSmtpEnabled(res.settings.smtpEnabled ?? false);
      setSmtpHost(res.settings.smtpHost ?? "");
      setSmtpPort(String(res.settings.smtpPort ?? 587));
      setSmtpUser(res.settings.smtpUser ?? "");
      setSmtpFrom(res.settings.smtpFrom ?? "");
      setSmtpPassSet(res.settings.smtpPassSet ?? false);
      setSmtpPass("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar as configurações de e-mail.",
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
      const res = await patchEmailSettings({
        fromName: fromName.trim() ? fromName.trim() : null,
        replyTo: replyTo.trim() ? replyTo.trim() : null,
        footerText: footerText.trim() ? footerText.trim() : null,
        smtpEnabled,
        smtpHost: smtpHost.trim() ? smtpHost.trim() : null,
        smtpPort: smtpPort.trim() ? Number(smtpPort) : null,
        smtpUser: smtpUser.trim() ? smtpUser.trim() : null,
        smtpFrom: smtpFrom.trim() ? smtpFrom.trim() : null,
        ...(smtpPass.trim() ? { smtpPass: smtpPass.trim() } : {}),
      });
      setData(res);
      setSmtpPassSet(res.settings.smtpPassSet ?? false);
      setSmtpPass("");
      setOk("Configurações de e-mail salvas.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar e-mail.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onTestEmail() {
    if (!canEdit) return;
    setTesting(true);
    setError(null);
    setOk(null);
    try {
      await postEmailTest();
      setOk("E-mail de teste enviado para o seu endereço.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao enviar teste.",
      );
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className="muted">Carregando e-mail…</p>;
  }

  return (
    <div>
      <div className="panel-head">
        <h2>E-mail</h2>
        <p>
          Identidade dos e-mails transacionais. Por padrão usa a caixa da
          plataforma (Brevo); opcionalmente configure SMTP próprio da
          consultoria.
          {!canEdit ? (
            <span className="muted"> Você tem acesso somente leitura.</span>
          ) : null}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-text">{ok}</p> : null}

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        <label className="field">
          <span>Nome do remetente</span>
          <input
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            disabled={!canEdit}
            placeholder="Ex.: Acme Suporte"
            maxLength={120}
          />
          <small className="muted">
            Aparece no From: junto com o endereço da plataforma ou SMTP próprio.
          </small>
        </label>

        <label className="field">
          <span>Reply-To</span>
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            disabled={!canEdit}
            placeholder="suporte@suaempresa.com.br"
          />
        </label>

        <label className="field">
          <span>Rodapé dos e-mails (opcional)</span>
          <textarea
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            disabled={!canEdit}
            rows={3}
            maxLength={1000}
            placeholder="Endereço, horário de atendimento, etc."
          />
        </label>

        <hr style={{ margin: "1.25rem 0", border: 0, borderTop: "1px solid var(--border)" }} />

        <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>SMTP da consultoria (opcional)</h3>

        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={smtpEnabled}
            disabled={!canEdit}
            onChange={(e) => setSmtpEnabled(e.target.checked)}
          />
          <span>Enviar e-mails pelo SMTP da consultoria</span>
        </label>

        <label className="field">
          <span>Host SMTP</span>
          <input
            type="text"
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            disabled={!canEdit || !smtpEnabled}
            placeholder="smtp.suaempresa.com.br"
          />
        </label>

        <label className="field">
          <span>Porta</span>
          <input
            type="number"
            value={smtpPort}
            onChange={(e) => setSmtpPort(e.target.value)}
            disabled={!canEdit || !smtpEnabled}
            min={1}
            max={65535}
          />
        </label>

        <label className="field">
          <span>Usuário SMTP</span>
          <input
            type="text"
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            disabled={!canEdit || !smtpEnabled}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Senha SMTP</span>
          <input
            type="password"
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
            disabled={!canEdit || !smtpEnabled}
            placeholder={smtpPassSet ? "•••••••• (deixe vazio para manter)" : ""}
            autoComplete="new-password"
          />
        </label>

        <label className="field">
          <span>From (opcional)</span>
          <input
            type="email"
            value={smtpFrom}
            onChange={(e) => setSmtpFrom(e.target.value)}
            disabled={!canEdit || !smtpEnabled}
            placeholder="noreply@suaempresa.com.br"
          />
        </label>

        {canEdit ? (
          <div className="form-actions">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={testing}
              onClick={() => void onTestEmail()}
            >
              {testing ? "Enviando…" : "Enviar e-mail de teste"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
