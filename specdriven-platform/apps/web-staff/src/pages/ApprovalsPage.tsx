import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  APPROVAL_KINDS,
  TICKET_STATUSES,
  type ApprovalKind,
  type ApprovalStatus,
  type TicketStatus,
} from "@specdriven/shared";
import {
  ApiError,
  approveApproval,
  createApproval,
  listApprovals,
  patchTicketHourLimit,
  rejectApproval,
  type ApprovalRow,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, statusLabel } from "../lib/labels";

const KIND_LABEL: Record<ApprovalKind, string> = {
  ticket: "Chamado",
  hour_limit: "Limite de horas",
  time_entry: "Lançamento de horas",
};

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

export function ApprovalsPage() {
  const { user } = useAuth();
  const isGestor = user?.role === "gestor";
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "">("pending");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [kind, setKind] = useState<ApprovalKind>("ticket");
  const [ticketKey, setTicketKey] = useState("DEMO-1");
  const [targetStatus, setTargetStatus] = useState<TicketStatus>("concluido");
  const [requestedMinutes, setRequestedMinutes] = useState(120);
  const [seconds, setSeconds] = useState(3600);
  const [reason, setReason] = useState("");
  const [hourLimit, setHourLimit] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listApprovals({
        status: statusFilter || undefined,
      });
      setApprovals(res.approvals);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar aprovações.",
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDecide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      if (decision === "approve") await approveApproval(id);
      else await rejectApproval(id);
      setInfo(decision === "approve" ? "Aprovado." : "Rejeitado.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha na decisão.");
    } finally {
      setBusyId(null);
    }
  }

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      if (kind === "ticket") {
        await createApproval({
          kind: "ticket",
          ticketKey,
          targetStatus,
          reason: reason || null,
        });
      } else if (kind === "hour_limit") {
        await createApproval({
          kind: "hour_limit",
          ticketKey,
          requestedMinutes,
          reason: reason || null,
        });
      } else {
        await createApproval({
          kind: "time_entry",
          ticketKey,
          seconds,
          reason: reason || null,
        });
      }
      setInfo("Solicitação criada.");
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao solicitar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSetLimit(e: FormEvent) {
    e.preventDefault();
    if (!isGestor) return;
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      await patchTicketHourLimit(ticketKey, hourLimit);
      setInfo(`Limite de ${ticketKey} = ${hourLimit} min.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao definir limite.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-eyebrow">Operação</p>
          <h1 className="page-title-serif">Aprovações.</h1>
          <p>
            Workflows de chamado, limite de horas e lançamentos.
          </p>
        </div>
        <label className="field" style={{ minWidth: 160 }}>
          <span>Filtro status</span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ApprovalStatus | "")
            }
          >
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
          </select>
        </label>
      </div>

      {loading ? <p className="muted">Carregando…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="ok-banner">{info}</p> : null}

      {statusFilter === "pending" && approvals.length > 0 ? (
        <section className="dark-card" style={{ marginBottom: "1rem" }}>
          <div className="dark-card-eyebrow">Aprovações</div>
          <h3>{approvals.length} solicitação(ões) aguardam revisão</h3>
          <p>Revise chamados, limites de horas e lançamentos pendentes.</p>
        </section>
      ) : null}

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Nova solicitação</h2>
        <form className="stack" onSubmit={onRequest}>
          <label className="field">
            <span>Tipo</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ApprovalKind)}
            >
              {APPROVAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Ticket key</span>
            <input
              value={ticketKey}
              onChange={(e) => setTicketKey(e.target.value.toUpperCase())}
              required
            />
          </label>
          {kind === "ticket" ? (
            <label className="field">
              <span>Status alvo</span>
              <select
                value={targetStatus}
                onChange={(e) =>
                  setTargetStatus(e.target.value as TicketStatus)
                }
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {kind === "hour_limit" ? (
            <label className="field">
              <span>Minutos solicitados</span>
              <input
                type="number"
                min={1}
                value={requestedMinutes}
                onChange={(e) => setRequestedMinutes(Number(e.target.value))}
                required
              />
            </label>
          ) : null}
          {kind === "time_entry" ? (
            <label className="field">
              <span>Segundos</span>
              <input
                type="number"
                min={1}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                required
              />
            </label>
          ) : null}
          <label className="field">
            <span>Motivo</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Opcional"
            />
          </label>
          <button className="btn" type="submit" disabled={submitting}>
            Solicitar
          </button>
        </form>
      </div>

      {isGestor ? (
        <div className="panel">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>
            Limite de horas (gestor)
          </h2>
          <form className="stack" onSubmit={onSetLimit}>
            <label className="field">
              <span>Ticket key</span>
              <input
                value={ticketKey}
                onChange={(e) => setTicketKey(e.target.value.toUpperCase())}
                required
              />
            </label>
            <label className="field">
              <span>Limite (minutos)</span>
              <input
                type="number"
                min={0}
                value={hourLimit}
                onChange={(e) => setHourLimit(Number(e.target.value))}
                required
              />
            </label>
            <button className="btn" type="submit" disabled={submitting}>
              Definir limite
            </button>
          </form>
        </div>
      ) : null}

      <div className="panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Fila</h2>
        {approvals.length === 0 && !loading ? (
          <p className="muted">Nenhuma solicitação.</p>
        ) : (
          <ul className="ticket-list">
            {approvals.map((a) => (
              <li key={a.id} className="ticket-row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div className="ticket-title">
                    {a.ticket?.key ?? a.ticketId.slice(0, 8)} · {KIND_LABEL[a.kind]}
                  </div>
                  <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                    {STATUS_LABEL[a.status]}
                    {a.targetStatus ? ` → ${statusLabel(a.targetStatus)}` : ""}
                    {a.requestedMinutes != null
                      ? ` · ${a.requestedMinutes} min`
                      : ""}
                    {a.requester?.name ? ` · ${a.requester.name}` : ""}
                    {" · "}
                    {formatDate(a.createdAt)}
                  </p>
                  {a.reason ? (
                    <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                      {a.reason}
                    </p>
                  ) : null}
                </div>
                {isGestor && a.status === "pending" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busyId === a.id}
                      onClick={() => void onDecide(a.id, "approve")}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === a.id}
                      onClick={() => void onDecide(a.id, "reject")}
                    >
                      Rejeitar
                    </button>
                  </div>
                ) : (
                  <span className={`badge badge-${a.status === "approved" ? "concluido" : "backlog"}`}>
                    {STATUS_LABEL[a.status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
