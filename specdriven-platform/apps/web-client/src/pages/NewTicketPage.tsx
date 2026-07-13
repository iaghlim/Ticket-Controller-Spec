import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { TICKET_TYPES, type TicketType } from "@specdriven/shared";
import {
  ApiError,
  createAttachmentMeta,
  createTicket,
  getPlatformMeta,
  listClients,
  uploadAttachment,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useClientContext } from "../lib/useClientContext";
import { usePortalSettings } from "../lib/usePortalSettings";
import { moduleLabel, ticketTypeLabel } from "../lib/labels";

function parseTicketType(
  value: string | null,
  allowed: TicketType[],
): TicketType | null {
  if (!value) return null;
  return allowed.includes(value as TicketType) ? (value as TicketType) : null;
}

export function NewTicketPage() {
  const { user } = useAuth();
  const { clientName } = useClientContext();
  const { settings: portalSettings, loading: portalLoading } = usePortalSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const enabledTypes = useMemo(
    () => portalSettings?.enabledTicketTypes ?? [...TICKET_TYPES],
    [portalSettings],
  );
  const enabledModules = useMemo(
    () => portalSettings?.enabledModules ?? [{ key: "geral", label: "Geral" }],
    [portalSettings],
  );

  const [companyName, setCompanyName] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("melhoria");
  const [module, setModule] = useState("geral");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (enabledTypes.length === 0) return;
    const fromQuery = parseTicketType(searchParams.get("type"), enabledTypes);
    if (fromQuery) {
      setTicketType(fromQuery);
    } else if (!enabledTypes.includes(ticketType)) {
      setTicketType(enabledTypes[0]!);
    }
  }, [searchParams, enabledTypes, ticketType]);

  useEffect(() => {
    if (enabledModules.length === 0) return;
    if (!enabledModules.some((m) => m.key === module)) {
      setModule(enabledModules[0]!.key);
    }
  }, [enabledModules, module]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingMeta(true);
      try {
        const [meta, clientsRes] = await Promise.all([
          getPlatformMeta(),
          listClients(),
        ]);
        if (!cancelled) {
          setStorageConfigured(Boolean(meta.flags?.storageConfigured));
          const client = clientsRes.clients[0];
          if (client?.name) setCompanyName(client.name);
        }
      } catch {
        /* defaults ok */
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user?.clientId) {
      setError(
        "Seu usuário não está vinculado a um cliente. Use o seed cliente@specdriven.local.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const { ticket } = await createTicket({
        title: title.trim(),
        clientId: user.clientId,
        description: description.trim() || undefined,
        ticketType,
        companyName: companyName.trim() || undefined,
        module,
      });

      if (file) {
        try {
          if (storageConfigured) {
            await uploadAttachment(ticket.key, file);
          } else {
            await createAttachmentMeta(ticket.key, {
              fileName: file.name,
              mimeType: file.type || undefined,
              sizeBytes: file.size,
            });
          }
        } catch (attachErr) {
          navigate(`/tickets/${encodeURIComponent(ticket.key)}`, {
            replace: true,
            state: {
              flash:
                attachErr instanceof ApiError
                  ? `Chamado criado, mas o anexo falhou: ${attachErr.message}`
                  : "Chamado criado, mas o anexo falhou.",
            },
          });
          return;
        }
      }

      navigate(`/tickets/${encodeURIComponent(ticket.key)}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError("Conflito ao gerar a chave do chamado. Tente de novo.");
        else setError(err.message);
      } else {
        setError("Falha ao criar chamado.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const formLoading = loadingMeta || portalLoading;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">{clientName}</p>
          <h1>Abrir novo chamado</h1>
          <p>Descreva o problema ou solicitação para a consultoria.</p>
        </div>
        <div className="page-head-actions">
          <Link className="btn btn-ghost" to="/tickets">
            Voltar
          </Link>
        </div>
      </div>

      <div className="panel">
        <form className="form" onSubmit={onSubmit}>
          <p className="muted form-hint">
            A chave do chamado é gerada automaticamente pela API.
          </p>

          <div className="field">
            <label>Tipo de chamado</label>
            <div className="type-picker">
              {enabledTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`type-picker-item${ticketType === t ? " active" : ""}`}
                  onClick={() => setTicketType(t)}
                  disabled={formLoading}
                >
                  {ticketTypeLabel(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="companyName">Nome da empresa</label>
            <input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              minLength={1}
              disabled={formLoading}
              placeholder="Razão social ou nome fantasia"
            />
          </div>

          <div className="field">
            <label htmlFor="module">Módulo</label>
            <select
              id="module"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              required
              disabled={formLoading}
            >
              {enabledModules.map((m) => (
                <option key={m.key} value={m.key}>
                  {moduleLabel(m.key, { [m.key]: m.label })}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="title">Assunto</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={1}
              placeholder="Descreva brevemente o que você precisa"
            />
          </div>

          <div className="field">
            <label htmlFor="description">Detalhes</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Inclua contexto, impacto e o que já foi tentado."
            />
          </div>

          <div className="field">
            <label htmlFor="attach-file">Anexar documento</label>
            <input
              id="attach-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span className="muted field-note">
                {file.name}
                {file.type ? ` · ${file.type}` : ""}
                {` · ${file.size} B`}
              </span>
            ) : (
              <span className="muted field-note">
                {storageConfigured
                  ? "Opcional — o arquivo será enviado após abrir o chamado."
                  : "Opcional — storage não configurado; só metadados serão registrados."}
              </span>
            )}
          </div>

          <div className="form-footer">
            <span className="muted form-trust">
              Chamado vinculado à {clientName}
            </span>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn" type="submit" disabled={submitting || formLoading}>
              {submitting ? "Enviando…" : "Enviar chamado"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
