import type {
  SlaState,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "@specdriven/shared";

export const NOT_CONFIGURED = "não configurado";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  em_teste: "Em teste",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  melhoria: "Melhoria",
  incidente: "Incidente",
  duvida: "Dúvida",
  problema: "Problema",
};

export function moduleLabel(
  module: string,
  catalogLabels?: Record<string, string>,
): string {
  if (catalogLabels?.[module]) return catalogLabels[module];
  return module.charAt(0).toUpperCase() + module.slice(1).replace(/_/g, " ");
}

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function ticketTypeLabel(type: TicketType | string): string {
  return TICKET_TYPE_LABELS[type as TicketType] ?? type;
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "—";
  return PRIORITY_LABELS[priority as TicketPriority] ?? priority;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export const SLA_STATE_LABELS: Record<SlaState, string> = {
  ok: "No prazo",
  breached: "Violado",
  paused: "Pausado",
  done: "Concluído",
};

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
