import type {
  CommentVisibility,
  SlaState,
  TicketPriority,
  TicketStatus,
  TicketType,
  UserRole,
} from "@specdriven/shared";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  em_teste: "Em teste",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  master: "Master",
  admin: "Administrador",
  gestor: "Gestor",
  consultor: "Consultor",
  cliente: "Cliente",
};

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function visibilityLabel(v: CommentVisibility): string {
  return v === "internal" ? "Interno" : "Público";
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.slice(0, 8);
}

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  melhoria: "Melhoria",
  incidente: "Incidente",
  duvida: "Dúvida",
  problema: "Problema",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const SLA_STATE_LABELS: Record<SlaState, string> = {
  ok: "No prazo",
  breached: "Violado",
  paused: "Pausado",
  done: "Concluído",
};

export function ticketTypeLabel(type: TicketType): string {
  return TICKET_TYPE_LABELS[type] ?? type;
}

export function priorityLabel(
  priority: string | null | undefined,
): string {
  if (!priority) return "—";
  return PRIORITY_LABELS[priority as TicketPriority] ?? priority;
}

export function slaStateLabel(state: SlaState): string {
  return SLA_STATE_LABELS[state] ?? state;
}

/** Minutos → "2h 30min" ou "45 min". */
export function formatMinutes(min: number | null | undefined): string {
  if (min == null || Number.isNaN(min)) return "—";
  const n = Math.round(min);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
