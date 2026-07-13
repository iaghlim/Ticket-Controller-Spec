import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Attachment, Comment, Tag, Ticket } from "@specdriven/shared";
import {
  ApiError,
  attachmentHasBinary,
  createAttachmentMeta,
  createComment,
  getAttachmentDownload,
  getTicket,
  getTicketSla,
  listAttachments,
  listComments,
  listTicketTags,
  uploadAttachment,
  type TicketSla,
} from "../lib/api";
import {
  formatDate,
  formatMinutes,
  moduleLabel,
  priorityLabel,
  slaStateLabel,
  statusLabel,
  ticketTypeLabel,
} from "../lib/labels";
import { usePortalSettings } from "../lib/usePortalSettings";

export function TicketDetailPage() {
  const { key = "" } = useParams();
  const location = useLocation();
  const { settings: portalSettings } = usePortalSettings();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [sla, setSla] = useState<TicketSla | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const [t, c, a, slaRes, tagsRes] = await Promise.all([
        getTicket(key),
        listComments(key),
        listAttachments(key),
        getTicketSla(key).catch(() => null),
        listTicketTags(key).catch(() => null),
      ]);
      setTicket(t.ticket);
      setSla(slaRes?.sla ?? null);
      setComments(c.comments);
      setTags(tagsRes?.tags ?? []);
      setAttachments(a.attachments);
      setStorageConfigured(Boolean(a.storageConfigured));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar o chamado.",
      );
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!key || !body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const { comment } = await createComment(key, body.trim());
      setComments((prev) => [...prev, comment]);
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao comentar.");
    } finally {
      setPosting(false);
    }
  }

  async function onAttach(e: FormEvent) {
    e.preventDefault();
    if (!key || !file) return;
    setAttaching(true);
    setError(null);
    try {
      const result = storageConfigured
        ? await uploadAttachment(key, file)
        : await createAttachmentMeta(key, {
            fileName: file.name,
            mimeType: file.type || undefined,
            sizeBytes: file.size,
          });
      setAttachments((prev) => [result.attachment, ...prev]);
      setFile(null);
      const input = document.getElementById(
        "detail-attach-file",
      ) as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao enviar anexo.",
      );
    } finally {
      setAttaching(false);
    }
  }

  async function onDownload(attachment: Attachment) {
    if (!key || !attachmentHasBinary(attachment)) return;
    setDownloadingId(attachment.id);
    setError(null);
    try {
      const { url } = await getAttachmentDownload(key, attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao baixar anexo.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  const moduleLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of portalSettings?.enabledModules ?? []) {
      map[m.key] = m.label;
    }
    return map;
  }, [portalSettings]);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow mono">{key}</p>
          <h1>{ticket?.title ?? (loading ? "Carregando…" : "Chamado")}</h1>
          {ticket ? (
            <p className="muted">
              Atualizado {formatDate(ticket.updatedAt)}
              {ticket.priority ? ` · ${priorityLabel(ticket.priority)}` : ""}
            </p>
          ) : null}
        </div>
        <div className="page-head-actions">
          <Link className="btn btn-ghost" to="/tickets">
            Meus chamados
          </Link>
        </div>
      </div>

      {error ? <p className="error page-error">{error}</p> : null}
      {flash ? <p className="warn-banner">{flash}</p> : null}

      {ticket ? (
        <div className="panel">
          {sla ? (
            <div className="sla-block">
              <div className="sla-block-row">
                <span className={`badge badge-sla-${sla.state}`}>
                  SLA · {slaStateLabel(sla.state)}
                </span>
                {sla.dueAt ? (
                  <span className="muted sla-meta">
                    Prazo: {formatDate(sla.dueAt)}
                  </span>
                ) : null}
                {sla.elapsedBusinessMinutes != null ? (
                  <span className="muted sla-meta">
                    Decorrido: {formatMinutes(sla.elapsedBusinessMinutes)}
                  </span>
                ) : null}
                {sla.remainingBusinessMinutes != null &&
                sla.state !== "done" &&
                sla.state !== "breached" ? (
                  <span className="muted sla-meta">
                    Restante: {formatMinutes(sla.remainingBusinessMinutes)}
                  </span>
                ) : null}
              </div>
              {sla.message ? (
                <p className="muted sla-message">{sla.message}</p>
              ) : null}
              {portalSettings?.businessHoursSummary ? (
                <p
                  className="muted sla-message"
                  title={portalSettings.businessHoursSummary}
                >
                  {portalSettings.businessHoursSummary}
                </p>
              ) : null}
            </div>
          ) : null}
          <dl className="detail-grid">
            <div className="detail-row">
              <dt>Status</dt>
              <dd>
                <span className={`badge badge-${ticket.status}`}>
                  {statusLabel(ticket.status)}
                </span>
              </dd>
            </div>
            {ticket.companyName ? (
              <div className="detail-row">
                <dt>Empresa</dt>
                <dd>{ticket.companyName}</dd>
              </div>
            ) : null}
            {ticket.ticketType ? (
              <div className="detail-row">
                <dt>Categoria</dt>
                <dd>{ticketTypeLabel(ticket.ticketType)}</dd>
              </div>
            ) : null}
            {ticket.module ? (
              <div className="detail-row">
                <dt>Módulo</dt>
                <dd>{moduleLabel(ticket.module, moduleLabels)}</dd>
              </div>
            ) : null}
            <div className="detail-row">
              <dt>Criado</dt>
              <dd>{formatDate(ticket.createdAt)}</dd>
            </div>
            {ticket.description ? (
              <div className="detail-row detail-row-block">
                <dt>Descrição</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</dd>
              </div>
            ) : null}
            {tags.length > 0 ? (
              <div className="detail-row detail-row-block">
                <dt>Tags</dt>
                <dd>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="tag-pill"
                        style={
                          tag.color
                            ? {
                                background: `${tag.color}22`,
                                color: tag.color,
                                borderColor: `${tag.color}55`,
                              }
                            : undefined
                        }
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Comentários</h2>
        </div>
        <div className="comment-list">
          {comments.length === 0 ? (
            <p className="muted">Nenhum comentário ainda.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="comment">
                <div className="comment-meta">{formatDate(c.createdAt)}</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))
          )}
        </div>
        <form className="form form-spaced" onSubmit={onComment}>
          <div className="field">
            <label htmlFor="comment">Novo comentário</label>
            <textarea
              id="comment"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={1}
              placeholder="Escreva sua atualização ou resposta…"
            />
          </div>
          <button className="btn" type="submit" disabled={posting || !ticket}>
            {posting ? "Enviando…" : "Comentar"}
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Anexos</h2>
            <p className="muted">
              {storageConfigured
                ? "Envie o arquivo — o binário vai para o MinIO/S3."
                : "Storage não configurado. Só metadados serão registrados."}
            </p>
          </div>
        </div>
        {attachments.length === 0 ? (
          <p className="muted">Nenhum anexo registrado.</p>
        ) : (
          <ul className="ticket-list">
            {attachments.map((a) => (
              <li key={a.id} className="ticket-row">
                <div>
                  <div className="ticket-title">{a.fileName}</div>
                  <div className="ticket-meta mono">
                    {[
                      a.mimeType,
                      a.sizeBytes != null ? `${a.sizeBytes} B` : null,
                      attachmentHasBinary(a) ? "arquivo" : "só metadados",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="ticket-row-actions">
                  {attachmentHasBinary(a) ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={downloadingId === a.id}
                      onClick={() => void onDownload(a)}
                    >
                      {downloadingId === a.id ? "…" : "Baixar"}
                    </button>
                  ) : null}
                  <span className="muted ticket-meta">
                    {formatDate(a.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="form form-spaced" onSubmit={onAttach}>
          <div className="field">
            <label htmlFor="detail-attach-file">Arquivo</label>
            <input
              id="detail-attach-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            {file ? (
              <span className="muted field-note">
                {file.name}
                {file.type ? ` · ${file.type}` : ""}
                {` · ${file.size} B`}
              </span>
            ) : null}
          </div>
          <button
            className="btn"
            type="submit"
            disabled={attaching || !ticket || !file}
          >
            {attaching
              ? "Enviando…"
              : storageConfigured
                ? "Enviar anexo"
                : "Registrar metadados"}
          </button>
        </form>
      </div>
    </>
  );
}
