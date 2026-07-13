import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type Attachment,
  type Comment,
  type CommentVisibility,
  type Tag,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
  type TimeEntry,
  type User,
} from "@specdriven/shared";
import {
  ApiError,
  attachmentHasBinary,
  createApproval,
  createAttachmentMeta,
  createComment,
  createTimeEntry,
  getAttachmentDownload,
  getTicket,
  getTicketSla,
  listAttachments,
  listComments,
  listTags,
  listTicketTags,
  listTimeEntries,
  listUsers,
  patchTicket,
  putTicketTags,
  uploadAttachment,
  type TicketPriority as ApiTicketPriority,
  type TicketSla,
  type TimeEntriesSummary,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  formatDate,
  formatMinutes,
  priorityLabel,
  roleLabel,
  shortId,
  slaStateLabel,
  statusLabel,
  ticketTypeLabel,
  visibilityLabel,
} from "../lib/labels";

function patchErrorMessage(err: ApiError): string {
  if (err.status === 403) return "Sem permissão para alterar este chamado.";
  if (err.status === 400 && String(err.message).includes("invalid_assignee")) {
    return "Assignee inválido — precisa ser gestor/consultor da org.";
  }
  return err.message;
}

function assigneeLabel(u: User, selfId?: string): string {
  const suffix = u.id === selfId ? " (você)" : "";
  return `${u.name} — ${roleLabel(u.role)}${suffix}`;
}

function entryMinutes(seconds: number | null | undefined): number {
  if (seconds == null) return 0;
  return Math.round(seconds / 60);
}

function isTicketPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function TicketDetailPage() {
  const { key = "" } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [sla, setSla] = useState<TicketSla | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [hoursSummary, setHoursSummary] = useState<TimeEntriesSummary | null>(
    null,
  );
  const [ticketTags, setTicketTags] = useState<Tag[]>([]);
  const [catalogTags, setCatalogTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<TicketStatus>("backlog");
  const [ticketType, setTicketType] = useState<TicketType>("melhoria");
  const [priority, setPriority] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<CommentVisibility>("public");
  const [file, setFile] = useState<File | null>(null);
  const [hoursMinutes, setHoursMinutes] = useState(30);
  const [hoursNote, setHoursNote] = useState("");
  const [approvalMinutes, setApprovalMinutes] = useState(120);
  const [approvalReason, setApprovalReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingHours, setPostingHours] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);

  const actionsRef = useRef<HTMLDivElement>(null);
  const hoursMinutesRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const [t, c, a, u, slaRes, hoursRes, tagsRes, catalogRes] =
        await Promise.all([
          getTicket(key),
          listComments(key),
          listAttachments(key),
          listUsers(["gestor", "consultor"]),
          getTicketSla(key).catch(() => null),
          listTimeEntries(key).catch(() => null),
          listTicketTags(key).catch(() => null),
          listTags().catch(() => null),
        ]);
      setTicket(t.ticket);
      setStatus(t.ticket.status);
      setTicketType(t.ticket.ticketType ?? "melhoria");
      setPriority(t.ticket.priority ?? "");
      setAssigneeId(t.ticket.assigneeId ?? "");
      setComments(c.comments);
      setAttachments(a.attachments);
      setStorageConfigured(Boolean(a.storageConfigured));
      setStaffUsers(u.users);
      setSla(slaRes?.sla ?? null);
      if (hoursRes) {
        setTimeEntries(hoursRes.timeEntries);
        setHoursSummary(hoursRes.summary);
      } else {
        setTimeEntries([]);
        setHoursSummary(null);
      }
      const assigned = tagsRes?.tags ?? [];
      setTicketTags(assigned);
      setSelectedTagIds(assigned.map((tag) => tag.id));
      setCatalogTags(catalogRes?.tags ?? []);
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

  useEffect(() => {
    if (!actionsOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (
        actionsRef.current &&
        !actionsRef.current.contains(e.target as Node)
      ) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [actionsOpen]);

  const assigneeName = useMemo(() => {
    if (!ticket?.assigneeId) return "—";
    const found = staffUsers.find((u) => u.id === ticket.assigneeId);
    if (found) return assigneeLabel(found, user?.id);
    return shortId(ticket.assigneeId);
  }, [ticket?.assigneeId, staffUsers, user?.id]);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of staffUsers) map.set(u.id, u.name);
    if (user) map.set(user.id, user.name);
    return map;
  }, [staffUsers, user]);

  async function reloadHours() {
    if (!key) return;
    const hoursRes = await listTimeEntries(key);
    setTimeEntries(hoursRes.timeEntries);
    setHoursSummary(hoursRes.summary);
  }

  function focusHoursForm() {
    setActionsOpen(false);
    const section = document.getElementById("hours-section");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => hoursMinutesRef.current?.focus(), 200);
  }

  function openApprovalModal() {
    setActionsOpen(false);
    setApprovalOpen(true);
  }

  async function onSaveStatus(e: FormEvent) {
    e.preventDefault();
    if (!key || !ticket) return;
    setSaving(true);
    setError(null);
    try {
      const { ticket: updated } = await patchTicket(key, { status });
      setTicket(updated);
      setStatus(updated.status);
      const slaRes = await getTicketSla(key).catch(() => null);
      if (slaRes) setSla(slaRes.sla);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? patchErrorMessage(err)
          : "Falha ao atualizar status.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTicketType(e: FormEvent) {
    e.preventDefault();
    if (!key || !ticket) return;
    setSaving(true);
    setError(null);
    try {
      const { ticket: updated } = await patchTicket(key, { ticketType });
      setTicket(updated);
      setTicketType(updated.ticketType ?? "melhoria");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? patchErrorMessage(err)
          : "Falha ao atualizar categoria.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSavePriority(e: FormEvent) {
    e.preventDefault();
    if (!key || !ticket || !priority || !isTicketPriority(priority)) return;
    setSaving(true);
    setError(null);
    try {
      const { ticket: updated } = await patchTicket(key, {
        priority: priority as ApiTicketPriority,
      });
      setTicket(updated);
      setPriority(updated.priority ?? "");
      const slaRes = await getTicketSla(key).catch(() => null);
      if (slaRes) setSla(slaRes.sla);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? patchErrorMessage(err)
          : "Falha ao atualizar prioridade.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAssignee(e: FormEvent) {
    e.preventDefault();
    if (!key) return;
    setSaving(true);
    setError(null);
    try {
      const next = assigneeId === "" ? null : assigneeId;
      const { ticket: updated } = await patchTicket(key, {
        assigneeId: next,
      });
      setTicket(updated);
      setAssigneeId(updated.assigneeId ?? "");
    } catch (err) {
      setError(
        err instanceof ApiError ? patchErrorMessage(err) : "Falha ao atribuir.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onAssignSelf() {
    if (!key || !user) return;
    setSaving(true);
    setError(null);
    try {
      const { ticket: updated } = await patchTicket(key, {
        assigneeId: user.id,
      });
      setTicket(updated);
      setAssigneeId(updated.assigneeId ?? "");
    } catch (err) {
      setError(
        err instanceof ApiError ? patchErrorMessage(err) : "Falha ao atribuir.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function onUnassign() {
    if (!key) return;
    setSaving(true);
    setError(null);
    try {
      const { ticket: updated } = await patchTicket(key, { assigneeId: null });
      setTicket(updated);
      setAssigneeId("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? patchErrorMessage(err)
          : "Falha ao remover assignee.",
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  }

  async function onSaveTags(e: FormEvent) {
    e.preventDefault();
    if (!key) return;
    setSavingTags(true);
    setError(null);
    setInfo(null);
    try {
      const { tags } = await putTicketTags(key, selectedTagIds);
      setTicketTags(tags);
      setSelectedTagIds(tags.map((t) => t.id));
      setInfo("Tags atualizadas.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao salvar tags.",
      );
    } finally {
      setSavingTags(false);
    }
  }

  async function onLogHours(e: FormEvent) {
    e.preventDefault();
    if (!key || hoursMinutes < 1) return;
    setPostingHours(true);
    setError(null);
    setInfo(null);
    try {
      const result = await createTimeEntry(key, {
        seconds: hoursMinutes * 60,
        note: hoursNote.trim() || null,
      });
      await reloadHours();
      setHoursNote("");
      if (result.requiresApproval) {
        setInfo("Horas registradas — aguardando aprovação.");
      } else {
        setInfo("Horas registradas.");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao registrar horas.",
      );
    } finally {
      setPostingHours(false);
    }
  }

  async function onRequestHourLimit(e: FormEvent) {
    e.preventDefault();
    if (!key || approvalMinutes < 1) return;
    setSubmittingApproval(true);
    setError(null);
    setInfo(null);
    try {
      await createApproval({
        kind: "hour_limit",
        ticketKey: key,
        requestedMinutes: approvalMinutes,
        reason: approvalReason.trim() || null,
      });
      setApprovalOpen(false);
      setApprovalReason("");
      setInfo("Pedido de aprovação de horas enviado.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao pedir aprovação de horas.",
      );
    } finally {
      setSubmittingApproval(false);
    }
  }

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!key || !body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const { comment } = await createComment(key, body.trim(), visibility);
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
        "attach-file",
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

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Chamado</p>
          <h1 className="page-title-serif mono" style={{ fontFamily: "var(--mono)", fontSize: "2rem" }}>
            {key}
          </h1>
          <p>{ticket?.title ?? (loading ? "Carregando…" : "Chamado")}</p>
        </div>
        <Link className="btn btn-ghost" to="/tickets">
          Fila
        </Link>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="muted">{info}</p> : null}

      {ticket ? (
        <div className="panel">
          {sla ? (
            <div
              style={{
                marginBottom: "1rem",
                paddingBottom: "1rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                <span className={`badge badge-sla-${sla.state}`}>
                  SLA · {slaStateLabel(sla.state)}
                </span>
                {sla.dueAt ? (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Prazo: {formatDate(sla.dueAt)}
                  </span>
                ) : null}
                {sla.elapsedBusinessMinutes != null ? (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Decorrido: {formatMinutes(sla.elapsedBusinessMinutes)}
                  </span>
                ) : null}
                {sla.remainingBusinessMinutes != null &&
                sla.state !== "done" &&
                sla.state !== "breached" ? (
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    Restante: {formatMinutes(sla.remainingBusinessMinutes)}
                  </span>
                ) : null}
              </div>
              {sla.message ? (
                <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
                  {sla.message}
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
            <div className="detail-row">
              <dt>Prioridade</dt>
              <dd>{priorityLabel(ticket.priority)}</dd>
            </div>
            <div className="detail-row">
              <dt>Categoria</dt>
              <dd>
                {ticket.ticketType
                  ? ticketTypeLabel(ticket.ticketType)
                  : "—"}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Assignee</dt>
              <dd>{assigneeName}</dd>
            </div>
            <div className="detail-row">
              <dt>Cliente</dt>
              <dd className="mono">{shortId(ticket.clientId)}</dd>
            </div>
            <div className="detail-row">
              <dt>Tags</dt>
              <dd>
                {ticketTags.length === 0 ? (
                  "—"
                ) : (
                  <span className="tag-grid">
                    {ticketTags.map((tag) => (
                      <span key={tag.id} className="tag-chip tag-chip-active">
                        {tag.color ? (
                          <span
                            className="tag-dot"
                            style={{ background: tag.color }}
                          />
                        ) : null}
                        {tag.name}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Criado</dt>
              <dd>{formatDate(ticket.createdAt)}</dd>
            </div>
            <div className="detail-row">
              <dt>Atualizado</dt>
              <dd>{formatDate(ticket.updatedAt)}</dd>
            </div>
            <div className="detail-row">
              <dt>Descrição</dt>
              <dd style={{ whiteSpace: "pre-wrap" }}>
                {ticket.description?.trim() || "—"}
              </dd>
            </div>
          </dl>

          <form
            className="form"
            style={{ marginTop: "1.25rem" }}
            onSubmit={onSaveStatus}
          >
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <label className="field" style={{ margin: 0, minWidth: 220 }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Alterar status
                </span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-sm" type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar status"}
              </button>
              <div className="actions-wrap" ref={actionsRef}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActionsOpen((v) => !v)}
                  aria-expanded={actionsOpen}
                >
                  Ações ▾
                </button>
                {actionsOpen ? (
                  <div className="actions-menu">
                    <button type="button" onClick={focusHoursForm}>
                      Registrar horas
                    </button>
                    <button type="button" onClick={openApprovalModal}>
                      Pedir aprovação de horas
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </form>

          <form
            className="form"
            style={{ marginTop: "0.75rem" }}
            onSubmit={onSaveTicketType}
          >
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <label className="field" style={{ margin: 0, minWidth: 220 }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Categoria ITIL
                </span>
                <select
                  value={ticketType}
                  onChange={(e) =>
                    setTicketType(e.target.value as TicketType)
                  }
                >
                  {TICKET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ticketTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-sm" type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar categoria"}
              </button>
            </div>
          </form>

          <form
            className="form"
            style={{ marginTop: "0.75rem" }}
            onSubmit={onSavePriority}
          >
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <label className="field" style={{ margin: 0, minWidth: 220 }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Prioridade
                </span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {priorityLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-sm"
                type="submit"
                disabled={saving || !priority}
              >
                {saving ? "Salvando…" : "Salvar prioridade"}
              </button>
            </div>
          </form>

          <form
            className="form"
            style={{ marginTop: "0.75rem" }}
            onSubmit={onSaveAssignee}
          >
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <label className="field" style={{ margin: 0, minWidth: 260 }}>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Atribuir a
                </span>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Sem assignee</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {assigneeLabel(u, user?.id)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-sm" type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar assignee"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={saving || !user}
                onClick={() => void onAssignSelf()}
              >
                Atribuir a mim
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={saving || !ticket.assigneeId}
                onClick={() => void onUnassign()}
              >
                Remover
              </button>
            </div>
          </form>

          {catalogTags.length > 0 ? (
            <form
              className="form"
              style={{ marginTop: "1rem" }}
              onSubmit={onSaveTags}
            >
              <div className="field">
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Tags do chamado
                </span>
                <div className="tag-grid">
                  {catalogTags.map((tag) => {
                    const active = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={`tag-chip${active ? " tag-chip-active" : ""}`}
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.color ? (
                          <span
                            className="tag-dot"
                            style={{ background: tag.color }}
                          />
                        ) : null}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                className="btn btn-sm"
                type="submit"
                disabled={savingTags}
                style={{ justifySelf: "start" }}
              >
                {savingTags ? "Salvando…" : "Salvar tags"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="panel" id="hours-section">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Horas</h2>
        {hoursSummary ? (
          <div className="stats-row" style={{ marginTop: 0 }}>
            <div className="stat">
              <span className="stat-label">Aprovadas</span>
              <span className="stat-value">
                {formatMinutes(hoursSummary.approvedMinutes)}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Limite</span>
              <span className="stat-value">
                {hoursSummary.hourLimitMinutes != null
                  ? formatMinutes(hoursSummary.hourLimitMinutes)
                  : "—"}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Lançamentos</span>
              <span className="stat-value">{timeEntries.length}</span>
            </div>
          </div>
        ) : null}
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && timeEntries.length === 0 ? (
          <p className="muted">Nenhum lançamento de horas.</p>
        ) : null}
        {timeEntries.length > 0 ? (
          <ul className="ticket-list">
            {timeEntries.map((entry) => (
              <li key={entry.id} className="ticket-row">
                <div>
                  <div className="ticket-title">
                    {formatMinutes(entryMinutes(entry.seconds))}
                    {entry.approvalStatus
                      ? ` · ${entry.approvalStatus}`
                      : ""}
                  </div>
                  <div className="ticket-meta">
                    {userNameById.get(entry.userId) ?? shortId(entry.userId)}
                    {" · "}
                    {formatDate(entry.createdAt)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="form"
          style={{ marginTop: "1rem" }}
          onSubmit={onLogHours}
        >
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <label className="field" style={{ margin: 0, minWidth: 140 }}>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Minutos
              </span>
              <input
                ref={hoursMinutesRef}
                id="hours-minutes"
                type="number"
                min={1}
                value={hoursMinutes}
                onChange={(e) => setHoursMinutes(Number(e.target.value))}
                required
              />
            </label>
            <label className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Nota (opcional)
              </span>
              <input
                value={hoursNote}
                onChange={(e) => setHoursNote(e.target.value)}
                placeholder="Descrição do trabalho"
              />
            </label>
            <button
              className="btn btn-sm"
              type="submit"
              disabled={postingHours || !ticket}
            >
              {postingHours ? "Registrando…" : "Registrar horas"}
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Comentários</h2>
        {loading ? <p className="muted">Carregando…</p> : null}
        {!loading && comments.length === 0 ? (
          <p className="muted">Nenhum comentário ainda.</p>
        ) : null}
        <div className="stack">
          {comments.map((c) => (
            <div
              key={c.id}
              className={`comment${c.visibility === "internal" ? " comment-internal" : ""}`}
            >
              <div className="comment-meta">
                <span>{formatDate(c.createdAt)}</span>
                <span
                  className={`badge badge-vis-${c.visibility}`}
                  style={{ fontSize: "0.7rem" }}
                >
                  {visibilityLabel(c.visibility)}
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))}
        </div>
        <form className="form" style={{ marginTop: "1rem" }} onSubmit={onComment}>
          <div className="field">
            <label htmlFor="comment">Novo comentário</label>
            <textarea
              id="comment"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={1}
            />
          </div>
          <div className="field">
            <label htmlFor="visibility">Visibilidade</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as CommentVisibility)
              }
            >
              <option value="public">Público (cliente vê)</option>
              <option value="internal">Interno (só consultoria)</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={posting || !ticket}>
            {posting ? "Enviando…" : "Comentar"}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Anexos</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          {storageConfigured
            ? "Envie o arquivo — o binário vai para o MinIO/S3."
            : "Storage não configurado (S3_ENDPOINT). Só metadados serão registrados."}
        </p>
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
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  {attachmentHasBinary(a) ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                      disabled={downloadingId === a.id}
                      onClick={() => void onDownload(a)}
                    >
                      {downloadingId === a.id ? "…" : "Baixar"}
                    </button>
                  ) : null}
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {formatDate(a.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="form" style={{ marginTop: "1rem" }} onSubmit={onAttach}>
          <div className="field">
            <label htmlFor="attach-file">Arquivo</label>
            <input
              id="attach-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
            {file ? (
              <span className="muted" style={{ fontSize: "0.8rem" }}>
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

      {approvalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approval-modal-title"
          onClick={() => setApprovalOpen(false)}
        >
          <div
            className="panel modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="approval-modal-title"
              style={{ marginTop: 0, fontSize: "1.1rem" }}
            >
              Pedir aprovação de horas
            </h2>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              Solicita aumento do limite de horas para {key}. O gestor decide em
              Aprovações.
            </p>
            <form className="form" onSubmit={onRequestHourLimit}>
              <label className="field">
                <span>Minutos solicitados</span>
                <input
                  type="number"
                  min={1}
                  value={approvalMinutes}
                  onChange={(e) =>
                    setApprovalMinutes(Number(e.target.value))
                  }
                  required
                />
              </label>
              <label className="field">
                <span>Motivo</span>
                <input
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <button
                  className="btn"
                  type="submit"
                  disabled={submittingApproval}
                >
                  {submittingApproval ? "Enviando…" : "Enviar pedido"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setApprovalOpen(false)}
                  disabled={submittingApproval}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
