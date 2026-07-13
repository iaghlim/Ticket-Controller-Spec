import type { Ticket } from "./schemas.js";

function slaCompletionInstant(ticket: Ticket): Date | null {
  if (ticket.resolvedAt) return new Date(ticket.resolvedAt);
  if (ticket.status === "concluido" || ticket.status === "cancelado") {
    return new Date(ticket.updatedAt);
  }
  return null;
}

/** Ticket cumpriu o prazo SLA (resolvido a tempo ou ainda dentro do prazo). */
export function isTicketSlaMet(ticket: Ticket, now = new Date()): boolean {
  if (!ticket.slaDueAt) return false;
  const due = new Date(ticket.slaDueAt);
  const completed = slaCompletionInstant(ticket);
  if (completed) return completed.getTime() <= due.getTime();
  return now.getTime() <= due.getTime();
}

/** % de cumprimento SLA para tickets criados no intervalo [from, to]. */
export function computePeriodSlaPct(
  tickets: Ticket[],
  from: Date,
  to: Date,
  now = new Date(),
): number | null {
  const inPeriod = tickets.filter((t) => {
    if (!t.slaDueAt) return false;
    const created = new Date(t.createdAt);
    return created >= from && created <= to;
  });
  if (inPeriod.length === 0) return null;
  const ok = inPeriod.filter((t) => isTicketSlaMet(t, now)).length;
  return Math.round((ok / inPeriod.length) * 1000) / 10;
}

export type OverviewPeriod = "current_month" | "previous_month" | "quarter";

export function overviewPeriodRange(period: OverviewPeriod): {
  from: Date;
  to: Date;
  label: string;
} {
  const now = new Date();
  if (period === "current_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
      label: "Mês atual",
    };
  }
  if (period === "previous_month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      label: "Mês anterior",
    };
  }
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  return {
    from: new Date(now.getFullYear(), qMonth, 1),
    to: new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999),
    label: "Trimestre atual",
  };
}

/** Intervalo do mês civil corrente (para SLA do mês no portal cliente). */
export function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}
