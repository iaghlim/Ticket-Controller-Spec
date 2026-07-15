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
  submitTicketFeedback,
  approveApproval,
  rejectApproval,
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

  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [feedbackSuccess, setFeedbackSuccess] = useState<boolean>(false);
  const [submittingFeedback, setSubmittingFeedback] = useState<boolean>(false);

  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null);
  const [approvalDecisionNote, setApprovalDecisionNote] = useState<string>("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

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

      {/* Card de Aprovações Pendentes */}
      {ticket && (() => {
        const ticketWithApprovals = ticket as any;
        const pendingApprovals = ticketWithApprovals.approvalRequests?.filter(
          (req: any) => req.status === "pending"
        ) || [];
        if (pendingApprovals.length === 0) return null;

        return (
          <div
            className="panel"
            style={{
              border: "2px solid var(--warning)",
              background: "rgba(234, 179, 8, 0.05)",
              padding: "1.5rem",
              marginBottom: "1rem",
              borderRadius: "var(--radius-lg)"
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1rem" }}>
              <span style={{ fontSize: "1.75rem", marginTop: "-2px" }}>🔔</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--warning)" }}>
                  Solicitação de Aprovação Pendente
                </h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>
                  Este chamado requer a sua aprovação para prosseguir.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {pendingApprovals.map((approval: any) => {
                let label = "Solicitação de aprovação.";
                if (approval.kind === "ticket") {
                  label = `Aprovação para alteração de status do chamado para: ${statusLabel(approval.targetStatus)}`;
                } else if (approval.kind === "hour_limit") {
                  label = `Aprovação de novo limite de horas de atendimento: ${approval.requestedMinutes} minutos.`;
                } else if (approval.kind === "time_entry") {
                  label = `Aprovação de apontamento de horas excedente.`;
                } else if (approval.kind === "change") {
                  label = `Aprovação de Mudança/Janela técnica.`;
                }

                return (
                  <div
                    key={approval.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "1.5rem",
                      background: "var(--bg)"
                    }}
                  >
                    <p style={{ fontWeight: 600, margin: "0 0 8px" }}>{label}</p>
                    {approval.reason && (
                      <div
                        style={{
                          fontStyle: "italic",
                          fontSize: "0.9rem",
                          padding: "0.5rem 0.75rem",
                          background: "var(--bg-soft)",
                          borderLeft: "3px solid var(--warning)",
                          marginBottom: "1rem",
                          borderRadius: "var(--radius-sm)"
                        }}
                      >
                        Justificativa: "{approval.reason}"
                      </div>
                    )}

                    {decisionError && decidingApprovalId === approval.id && (
                      <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
                        {decisionError}
                      </div>
                    )}

                    <div className="field" style={{ marginBottom: "1rem" }}>
                      <label htmlFor={`decision-note-${approval.id}`}>
                        Nota / Comentário da sua decisão (opcional)
                      </label>
                      <input
                        id={`decision-note-${approval.id}`}
                        type="text"
                        placeholder="Ex: Aprovado conforme alinhado..."
                        value={decidingApprovalId === approval.id ? approvalDecisionNote : ""}
                        onChange={(e) => {
                          setDecidingApprovalId(approval.id);
                          setApprovalDecisionNote(e.target.value);
                        }}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        className="btn"
                        style={{ background: "#22c55e", color: "white" }}
                        onClick={async () => {
                          setDecidingApprovalId(approval.id);
                          setDecisionError(null);
                          try {
                            await approveApproval(approval.id, approvalDecisionNote.trim() || null);
                            setApprovalDecisionNote("");
                            setDecidingApprovalId(null);
                            await load();
                          } catch (err) {
                            setDecisionError(
                              err instanceof ApiError ? err.message : "Erro ao aprovar solicitação."
                            );
                          }
                        }}
                      >
                        Aprovar
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ border: "1px solid #ef4444", color: "#ef4444" }}
                        onClick={async () => {
                          setDecidingApprovalId(approval.id);
                          setDecisionError(null);
                          try {
                            await rejectApproval(approval.id, approvalDecisionNote.trim() || null);
                            setApprovalDecisionNote("");
                            setDecidingApprovalId(null);
                            await load();
                          } catch (err) {
                            setDecisionError(
                              err instanceof ApiError ? err.message : "Erro ao rejeitar solicitação."
                            );
                          }
                        }}
                      >
                        Reprovar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {ticket && ticket.status === "concluido" && (
        <div className="panel" style={{ border: "1px solid var(--border)", background: "var(--bg-soft)" }}>
          {ticket.csatScore === null ? (
            feedbackSuccess ? (
              <div style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
                <span style={{ fontSize: "2rem" }}>✨</span>
                <h3 style={{ margin: "0.5rem 0", fontSize: "1.1rem", color: "var(--ok)" }}>Obrigado pelo seu feedback!</h3>
                <p className="muted" style={{ margin: 0 }}>Sua opinião é muito importante para melhorarmos nossos serviços.</p>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (rating === 0) {
                    alert("Por favor, selecione uma nota de 1 a 5 estrelas.");
                    return;
                  }
                  setSubmittingFeedback(true);
                  try {
                    const res = await submitTicketFeedback(key, {
                      csatScore: rating,
                      csatComment: comment.trim() || null,
                    });
                    setFeedbackSuccess(true);
                    setTicket(res.ticket);
                  } catch (err) {
                    alert(err instanceof ApiError ? err.message : "Erro ao enviar feedback.");
                  } finally {
                    setSubmittingFeedback(false);
                  }
                }}
                className="form form-spaced"
                style={{ padding: "0.5rem" }}
              >
                <div className="panel-head" style={{ marginBottom: "1rem" }}>
                  <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Avaliar Atendimento</h2>
                  <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                    Por favor, avalie sua experiência com este chamado.
                  </p>
                </div>

                <div className="field">
                  <span style={{ fontSize: "0.9rem", fontWeight: 500, display: "block", marginBottom: "0.5rem" }}>
                    Sua nota:
                  </span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "2rem",
                          padding: 0,
                          color: star <= rating ? "#eab308" : "#d1d5db",
                          transition: "color 0.2s ease",
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="csat-comment">Comentário opcional</label>
                  <textarea
                    id="csat-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Conte-nos o que achou do atendimento..."
                    rows={3}
                  />
                </div>

                <button className="btn" type="submit" disabled={submittingFeedback || rating === 0}>
                  {submittingFeedback ? "Enviando…" : "Enviar Avaliação"}
                </button>
              </form>
            )
          ) : (
            <div style={{ padding: "0.5rem" }}>
              <div className="panel-head" style={{ marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Sua Avaliação</h2>
                <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>
                  Obrigado por avaliar este chamado.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      style={{
                        fontSize: "1.5rem",
                        color: star <= (ticket.csatScore ?? 0) ? "#eab308" : "#d1d5db",
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
                {ticket.csatComment ? (
                  <div
                    style={{
                      fontStyle: "italic",
                      background: "var(--bg-muted)",
                      padding: "0.75rem",
                      borderRadius: "var(--radius-sm)",
                      borderLeft: "4px solid var(--accent)",
                      color: "var(--text)",
                    }}
                  >
                    "{ticket.csatComment}"
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

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
