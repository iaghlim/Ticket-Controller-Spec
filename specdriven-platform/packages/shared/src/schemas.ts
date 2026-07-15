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

/** Módulos/áreas do sistema — master list legado; catálogo real vem da API por org. */
export const TICKET_MODULES = ["geral"] as const;

export type TicketModule = (typeof TICKET_MODULES)[number];

export const TicketModuleSchema = z.enum(TICKET_MODULES);

/** Chave de módulo no catálogo da organização (slug). */
export const MODULE_KEY_REGEX = /^[a-z][a-z0-9_]{1,31}$/;

export const ModuleKeySchema = z
  .string()
  .regex(MODULE_KEY_REGEX, "Chave deve ser minúscula, 2–32 chars (a-z, 0-9, _)");

export const DEFAULT_ENABLED_TICKET_TYPES_CSV = TICKET_TYPES.join(",");

export function parseEnabledTicketTypes(csv: string): TicketType[] {
  const parts = csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = parts.filter((p): p is TicketType =>
    TICKET_TYPES.includes(p as TicketType),
  );
  return valid.length > 0 ? valid : [...TICKET_TYPES];
}

export function serializeEnabledTicketTypes(types: TicketType[]): string {
  return types.join(",");
}

export const TicketModuleCatalogSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  key: ModuleKeySchema,
  label: z.string().min(1).max(80),
  sortOrder: z.number().int(),
  enabled: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TicketModuleCatalog = z.infer<typeof TicketModuleCatalogSchema>;

export const PortalModuleSchema = z.object({
  key: z.string(),
  label: z.string(),
});
export type PortalModule = z.infer<typeof PortalModuleSchema>;

export const CreateModuleBodySchema = z.object({
  key: ModuleKeySchema,
  label: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
});
export type CreateModuleBody = z.infer<typeof CreateModuleBodySchema>;

export const PatchModuleBodySchema = z
  .object({
    label: z.string().min(1).max(80).optional(),
    sortOrder: z.number().int().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.label !== undefined ||
      b.sortOrder !== undefined ||
      b.enabled !== undefined,
    { message: "Informe ao menos um campo" },
  );
export type PatchModuleBody = z.infer<typeof PatchModuleBodySchema>;

export const PatchPortalSettingsBodySchema = z
  .object({
    enabledTicketTypes: z
      .array(TicketTypeSchema)
      .min(1, "Pelo menos um tipo deve permanecer habilitado")
      .optional(),
    knowledgeBaseEnabled: z.boolean().optional(),
    knowledgeBaseUrl: z.union([z.string().url(), z.null()]).optional(),
    portalHeroTitle: z.union([z.string().min(1).max(120), z.null()]).optional(),
    portalHeroSubtitle: z.union([z.string().max(300), z.null()]).optional(),
  })
  .refine(
    (b) =>
      b.enabledTicketTypes !== undefined ||
      b.knowledgeBaseEnabled !== undefined ||
      b.knowledgeBaseUrl !== undefined ||
      b.portalHeroTitle !== undefined ||
      b.portalHeroSubtitle !== undefined,
    { message: "Informe ao menos um campo" },
  );
export type PatchPortalSettingsBody = z.infer<
  typeof PatchPortalSettingsBodySchema
>;

export const CLIENT_NOTIFICATION_EVENTS = [
  "ticket.status_changed",
  "ticket.comment_public",
  "ticket.created",
] as const;
export type ClientNotificationEvent =
  (typeof CLIENT_NOTIFICATION_EVENTS)[number];

export const STAFF_NOTIFICATION_EVENTS = [
  "ticket.comment_public",
  "approval.pending",
] as const;
export type StaffNotificationEvent =
  (typeof STAFF_NOTIFICATION_EVENTS)[number];

export const NotificationChannelPrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
});
export type NotificationChannelPrefs = z.infer<
  typeof NotificationChannelPrefsSchema
>;

export const StaffNotificationChannelPrefsSchema =
  NotificationChannelPrefsSchema.extend({
    recipients: z.array(z.enum(["assignee", "gestores"])).optional(),
  });
export type StaffNotificationChannelPrefs = z.infer<
  typeof StaffNotificationChannelPrefsSchema
>;

export const NotificationPrefsSchema = z.object({
  client: z.object({
    "ticket.status_changed": NotificationChannelPrefsSchema,
    "ticket.comment_public": NotificationChannelPrefsSchema,
    "ticket.created": NotificationChannelPrefsSchema,
  }),
  staff: z.object({
    "ticket.comment_public": StaffNotificationChannelPrefsSchema,
    "approval.pending": StaffNotificationChannelPrefsSchema,
  }),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    client: {
      "ticket.status_changed": { inApp: true, email: true },
      "ticket.comment_public": { inApp: true, email: true },
      "ticket.created": { inApp: false, email: false },
    },
    staff: {
      "ticket.comment_public": {
        inApp: true,
        email: false,
        recipients: ["assignee", "gestores"],
      },
      "approval.pending": {
        inApp: true,
        email: false,
        recipients: ["gestores"],
      },
    },
  };
}

export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  const defaults = defaultNotificationPrefs();
  if (!json?.trim()) return defaults;
  try {
    const parsed = JSON.parse(json) as unknown;
    const result = NotificationPrefsSchema.safeParse(parsed);
    if (result.success) return result.data;
  } catch {
    // fall through
  }
  return defaults;
}

export function serializeNotificationPrefs(prefs: NotificationPrefs): string {
  return JSON.stringify(prefs);
}

export const PatchEmailSettingsBodySchema = z
  .object({
    fromName: z.union([z.string().min(1).max(120), z.null()]).optional(),
    replyTo: z.union([z.string().email(), z.null()]).optional(),
    footerText: z.union([z.string().max(1000), z.null()]).optional(),
    smtpEnabled: z.boolean().optional(),
    smtpHost: z.union([z.string().min(1).max(255), z.null()]).optional(),
    smtpPort: z.union([z.number().int().min(1).max(65535), z.null()]).optional(),
    smtpUser: z.union([z.string().min(1).max(255), z.null()]).optional(),
    smtpPass: z.union([z.string().min(1).max(512), z.null()]).optional(),
    smtpFrom: z.union([z.string().email(), z.null()]).optional(),
  })
  .refine(
    (b) =>
      b.fromName !== undefined ||
      b.replyTo !== undefined ||
      b.footerText !== undefined ||
      b.smtpEnabled !== undefined ||
      b.smtpHost !== undefined ||
      b.smtpPort !== undefined ||
      b.smtpUser !== undefined ||
      b.smtpPass !== undefined ||
      b.smtpFrom !== undefined,
    { message: "Informe ao menos um campo" },
  );
export type PatchEmailSettingsBody = z.infer<
  typeof PatchEmailSettingsBodySchema
>;

export const PatchNotificationSettingsBodySchema = z.object({
  notificationPrefs: NotificationPrefsSchema,
});
export type PatchNotificationSettingsBody = z.infer<
  typeof PatchNotificationSettingsBodySchema
>;

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
export const APPROVAL_KINDS = ["ticket", "hour_limit", "time_entry", "change"] as const;
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
  code: z.string().min(1),
  billingModel: z.enum(["per_hour", "per_ticket", "fixed_project"]).default("per_hour"),
  baselineHoursMonth: z.number().nullable().optional(),
  hourlyRateCents: z.number().int().nullable().optional(),
  ticketRateCents: z.number().int().nullable().optional(),
  budgetCents: z.number().int().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  slaActiveStatuses: z.string().default("em_andamento"),
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
  module: z.string().min(1).optional().nullable(),
  countsTowardBaseline: z.boolean().optional(),
  slaDueAt: z.coerce.date().optional().nullable(),
  firstResponseAt: z.coerce.date().optional().nullable(),
  resolvedAt: z.coerce.date().optional().nullable(),
  csatScore: z.number().int().min(1).max(5).optional().nullable(),
  csatComment: z.string().optional().nullable(),
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
  visibleToClient: z.boolean().optional().default(false),
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

export const DefaultBusinessHoursSchema = z.object({
  businessHourStart: z.number().int().min(0).max(23),
  businessHourEnd: z.number().int().min(1).max(24),
  weekdays: z.string().min(1).max(32),
});
export type DefaultBusinessHours = z.infer<typeof DefaultBusinessHoursSchema>;

export const DEFAULT_BUSINESS_HOURS: DefaultBusinessHours = {
  businessHourStart: 9,
  businessHourEnd: 18,
  weekdays: "1,2,3,4,5",
};

export const OrganizationHolidaySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  date: z.coerce.date(),
  name: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type OrganizationHoliday = z.infer<typeof OrganizationHolidaySchema>;

export const OrganizationSettingsSchema = z.object({
  organizationId: z.string().uuid(),
  supportEmail: z.string().email().nullable().optional(),
  supportPolicyText: z.string().nullable().optional(),
  enabledTicketTypes: z.array(TicketTypeSchema).optional(),
  slaTargetPct: z.number().int().min(1).max(100).optional(),
  defaultBusinessHours: DefaultBusinessHoursSchema.nullable().optional(),
  emailFromName: z.string().nullable().optional(),
  emailReplyTo: z.string().email().nullable().optional(),
  emailFooterText: z.string().nullable().optional(),
  smtpEnabled: z.boolean().optional(),
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().nullable().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPassSet: z.boolean().optional(),
  smtpFrom: z.string().email().nullable().optional(),
  portalHeroTitle: z.string().nullable().optional(),
  portalHeroSubtitle: z.string().nullable().optional(),
  knowledgeBaseEnabled: z.boolean().optional(),
  knowledgeBaseUrl: z.string().url().nullable().optional(),
  notificationPrefs: NotificationPrefsSchema.optional(),
});
export type OrganizationSettings = z.infer<typeof OrganizationSettingsSchema>;

export const SettingsCompletenessSchema = z.object({
  profile: z.boolean(),
  sla: z.boolean(),
  catalog: z.boolean(),
  communication: z.boolean(),
});
export type SettingsCompleteness = z.infer<typeof SettingsCompletenessSchema>;

export const StaffSettingsSchema = z.object({
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  settings: OrganizationSettingsSchema,
  completeness: SettingsCompletenessSchema,
  canEdit: z.boolean(),
});
export type StaffSettings = z.infer<typeof StaffSettingsSchema>;

export const PortalSettingsSchema = z.object({
  organizationName: z.string(),
  supportEmail: z.string().email().nullable(),
  supportPolicyText: z.string().nullable(),
  logoUrl: z.string().url().nullable(),
  portalHeroTitle: z.string().nullable(),
  portalHeroSubtitle: z.string().nullable(),
  enabledTicketTypes: z.array(TicketTypeSchema),
  enabledModules: z.array(PortalModuleSchema),
  slaTargetPct: z.number().int().min(1).max(100),
  businessHoursSummary: z.string().nullable(),
  knowledgeBaseEnabled: z.boolean(),
  knowledgeBaseUrl: z.string().url().nullable(),
  serviceOfferings: z.array(z.object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
  })).optional(),
});
export type PortalSettings = z.infer<typeof PortalSettingsSchema>;

export const PatchOrganizationSettingsBodySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  supportEmail: z.union([z.string().email(), z.null()]).optional(),
  supportPolicyText: z.union([z.string().max(500), z.null()]).optional(),
});
export type PatchOrganizationSettingsBody = z.infer<
  typeof PatchOrganizationSettingsBodySchema
>;

export const PatchSlaSettingsBodySchema = z
  .object({
    slaTargetPct: z.number().int().min(1).max(100).optional(),
    defaultBusinessHours: DefaultBusinessHoursSchema.nullable().optional(),
  })
  .refine(
    (b) =>
      b.slaTargetPct !== undefined || b.defaultBusinessHours !== undefined,
    { message: "Informe ao menos um campo" },
  );
export type PatchSlaSettingsBody = z.infer<typeof PatchSlaSettingsBodySchema>;

export const CreateHolidayBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().max(120).optional().nullable(),
});
export type CreateHolidayBody = z.infer<typeof CreateHolidayBodySchema>;
