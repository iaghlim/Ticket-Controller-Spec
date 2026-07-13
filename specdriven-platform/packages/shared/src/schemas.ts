import { z } from "zod";

/** Ticket workflow statuses (PT-BR product language). */
export const TICKET_STATUSES = [
  "backlog",
  "em_andamento",
  "aguardando_cliente",
  "em_teste",
  "concluido",
  "cancelado",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TicketStatusSchema = z.enum(TICKET_STATUSES);

/** ITIL-ish ticket types (Fase E). */
export const TICKET_TYPES = [
  "melhoria",
  "incidente",
  "duvida",
  "problema",
] as const;

export type TicketType = (typeof TICKET_TYPES)[number];

export const TicketTypeSchema = z.enum(TICKET_TYPES);

/** Prioridades alinhadas ao desktop SpecDriven. */
export const TICKET_PRIORITIES = [
  "baixa",
  "media",
  "alta",
  "critica",
] as const;

export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TicketPrioritySchema = z.enum(TICKET_PRIORITIES);

/** Módulos/áreas do sistema — expandir conforme o catálogo do cliente. */
export const TICKET_MODULES = ["geral"] as const;

export type TicketModule = (typeof TICKET_MODULES)[number];

export const TicketModuleSchema = z.enum(TICKET_MODULES);

/** Platform roles. */
export const USER_ROLES = [
  "master",
  "admin",
  "gestor",
  "consultor",
  "cliente",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const UserRoleSchema = z.enum(USER_ROLES);

/** Workflows de aprovação (workstream dedicado). */
export const APPROVAL_KINDS = ["ticket", "hour_limit", "time_entry"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export const ApprovalKindSchema = z.enum(APPROVAL_KINDS);

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);

/**
 * Ticket key pattern: PREFIX-number
 * Examples: ABC-1, SD-42, CLIENT1-100
 */
export const TICKET_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/;

export const TicketKeySchema = z
  .string()
  .regex(TICKET_KEY_REGEX, "Ticket key must match PREFIX-number (e.g. ABC-123)");

export const CommentVisibilitySchema = z.enum(["public", "internal"]);
export type CommentVisibility = z.infer<typeof CommentVisibilitySchema>;

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isMasterConsultancy: z.boolean().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Eyebrow label for staff overview — uses consultancy display name. */
export function operationsCenterLabel(orgName: string): string {
  return `Central de operações — ${orgName}`;
}

export const ClientSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1).optional().nullable(),
  baselineHoursMonth: z.number().nonnegative().optional().nullable(),
  hourlyRateCents: z.number().int().nonnegative().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Client = z.infer<typeof ClientSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleSchema,
  clientId: z.string().uuid().optional().nullable(),
  hourRateFactor: z.number().positive().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const TicketSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  key: TicketKeySchema,
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: TicketStatusSchema,
  priority: z.string().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  estimateMinutes: z.number().int().nonnegative().optional().nullable(),
  hourLimitMinutes: z.number().int().nonnegative().optional().nullable(),
  ticketType: TicketTypeSchema.optional(),
  companyName: z.string().min(1).optional().nullable(),
  module: TicketModuleSchema.optional().nullable(),
  countsTowardBaseline: z.boolean().optional(),
  slaDueAt: z.coerce.date().optional().nullable(),
  firstResponseAt: z.coerce.date().optional().nullable(),
  resolvedAt: z.coerce.date().optional().nullable(),
  deletedAt: z.coerce.date().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const CommentSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  authorId: z.string().uuid(),
  body: z.string().min(1),
  visibility: CommentVisibilitySchema,
  createdAt: z.coerce.date(),
});
export type Comment = z.infer<typeof CommentSchema>;

export const AttachmentSchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional().nullable(),
  sizeBytes: z.number().int().nonnegative().optional().nullable(),
  createdAt: z.coerce.date(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const TagSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TicketStatusHistorySchema = z.object({
  id: z.string().uuid(),
  ticketId: z.string().uuid(),
  fromStatus: TicketStatusSchema.nullable().optional(),
  toStatus: TicketStatusSchema,
  changedById: z.string().uuid(),
  note: z.string().optional().nullable(),
  createdAt: z.coerce.date(),
});
export type TicketStatusHistory = z.infer<typeof TicketStatusHistorySchema>;

export const SlaPolicySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  name: z.string().min(1),
  priorityMatch: z.string(),
  responseMinutes: z.number().int().positive(),
  resolutionMinutes: z.number().int().positive(),
  businessHourStart: z.number().int().min(0).max(23),
  businessHourEnd: z.number().int().min(1).max(24),
  weekdays: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SlaPolicy = z.infer<typeof SlaPolicySchema>;

export const SLA_STATES = ["ok", "breached", "paused", "done"] as const;
export type SlaState = (typeof SLA_STATES)[number];
export const SlaStateSchema = z.enum(SLA_STATES);

export const TimeEntrySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  ticketId: z.string().uuid(),
  userId: z.string().uuid(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional().nullable(),
  seconds: z.number().int().nonnegative().optional().nullable(),
  note: z.string().optional().nullable(),
  approvalStatus: ApprovalStatusSchema.optional(),
  createdAt: z.coerce.date(),
});
export type TimeEntry = z.infer<typeof TimeEntrySchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: ApprovalKindSchema,
  status: ApprovalStatusSchema,
  ticketId: z.string().uuid(),
  timeEntryId: z.string().uuid().optional().nullable(),
  requesterId: z.string().uuid(),
  reviewerId: z.string().uuid().optional().nullable(),
  targetStatus: TicketStatusSchema.optional().nullable(),
  requestedMinutes: z.number().int().optional().nullable(),
  reason: z.string().optional().nullable(),
  decisionNote: z.string().optional().nullable(),
  decidedAt: z.coerce.date().optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
