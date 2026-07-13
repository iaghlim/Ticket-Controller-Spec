import type { TicketModule, TicketPriority, TicketStatus, TicketType } from "@specdriven/shared";

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

export const MODULE_LABELS: Record<TicketModule, string> = {
  geral: "Geral",
};

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function ticketTypeLabel(type: TicketType): string {
  return TICKET_TYPE_LABELS[type] ?? type;
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

export function moduleLabel(module: TicketModule): string {
  return MODULE_LABELS[module] ?? module;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
