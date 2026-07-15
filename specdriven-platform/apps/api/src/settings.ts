import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CreateModuleBodySchema,
  CreateHolidayBodySchema,
  PatchEmailSettingsBodySchema,
  PatchModuleBodySchema,
  PatchNotificationSettingsBodySchema,
  PatchPortalSettingsBodySchema,
  PatchSlaSettingsBodySchema,
  parseEnabledTicketTypes,
  parseNotificationPrefs,
  serializeEnabledTicketTypes,
  serializeNotificationPrefs,
  type DefaultBusinessHours,
  type TicketType,
} from "@specdriven/shared";
import { requireAuth } from "./auth.js";
import { auditActor, writeAudit } from "./audit.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { sendTestEmail } from "./mail.js";
import { canManageSettings, isStaff } from "./permissions.js";
import {
  getPresignedDownloadUrl,
  isStorageConfigured,
  putObject,
} from "./storage.js";
import {
  dateKeyLocal,
  formatBusinessHoursSummaryPtBr,
  parseDefaultBusinessHoursJson,
  serializeDefaultBusinessHours,
} from "./sla-calc.js";

const PatchOrganizationSettingsSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    supportEmail: z.union([z.string().email(), z.null()]).optional(),
    supportPolicyText: z.union([z.string().max(500), z.null()]).optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.supportEmail !== undefined ||
      b.supportPolicyText !== undefined,
    { message: "Informe ao menos um campo" },
  );

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

function requireDbOrg(
  organizationId: string,
  reply: FastifyReply,
): boolean {
  if (organizationId === "dev-org") {
    reply.status(503).send({
      error: "database_required",
      message: "Configurações exigem Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
    return false;
  }
  return true;
}

async function ensureDefaultModuleCatalog(organizationId: string) {
  const count = await prisma.ticketModuleCatalog.count({
    where: { organizationId },
  });
  if (count === 0) {
    await prisma.ticketModuleCatalog.create({
      data: {
        organizationId,
        key: "geral",
        label: "Geral",
        sortOrder: 0,
        enabled: true,
      },
    });
  }
}

async function getOrCreateSettings(organizationId: string) {
  const existing = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (existing) {
    await ensureDefaultModuleCatalog(organizationId);
    return existing;
  }
  const created = await prisma.organizationSettings.create({
    data: { organizationId },
  });
  await ensureDefaultModuleCatalog(organizationId);
  return created;
}

/** Exported for notification/mail helpers. */
export const getOrCreateSettingsRecord = getOrCreateSettings;

export async function getOrgEmailSettings(organizationId: string): Promise<{
  fromName: string | null;
  replyTo: string | null;
  footerText: string | null;
}> {
  const settings = await getOrCreateSettings(organizationId);
  return {
    fromName: settings.emailFromName,
    replyTo: settings.emailReplyTo,
    footerText: settings.emailFooterText,
  };
}

function settingsDto(
  settings: {
    organizationId: string;
    supportEmail: string | null;
    supportPolicyText: string | null;
    enabledTicketTypes: string;
    slaTargetPct: number;
    defaultBusinessHoursJson: string | null;
    emailFromName: string | null;
    emailReplyTo: string | null;
    emailFooterText: string | null;
    knowledgeBaseEnabled: boolean;
    knowledgeBaseUrl: string | null;
    notificationPrefsJson: string;
    portalHeroTitle?: string | null;
    portalHeroSubtitle?: string | null;
    smtpEnabled?: boolean;
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    smtpFrom?: string | null;
  },
) {
  return {
    organizationId: settings.organizationId,
    supportEmail: settings.supportEmail,
    supportPolicyText: settings.supportPolicyText,
    enabledTicketTypes: parseEnabledTicketTypes(settings.enabledTicketTypes),
    slaTargetPct: settings.slaTargetPct,
    defaultBusinessHours: settings.defaultBusinessHoursJson
      ? parseDefaultBusinessHoursJson(settings.defaultBusinessHoursJson)
      : null,
    emailFromName: settings.emailFromName,
    emailReplyTo: settings.emailReplyTo,
    emailFooterText: settings.emailFooterText,
    smtpEnabled: settings.smtpEnabled ?? false,
    smtpHost: settings.smtpHost ?? null,
    smtpPort: settings.smtpPort ?? null,
    smtpUser: settings.smtpUser ?? null,
    smtpPassSet: Boolean(settings.smtpPass?.trim()),
    smtpFrom: settings.smtpFrom ?? null,
    portalHeroTitle: settings.portalHeroTitle ?? null,
    portalHeroSubtitle: settings.portalHeroSubtitle ?? null,
    knowledgeBaseEnabled: settings.knowledgeBaseEnabled,
    knowledgeBaseUrl: settings.knowledgeBaseUrl,
    notificationPrefs: parseNotificationPrefs(settings.notificationPrefsJson),
  };
}

export async function getOrgBusinessHoursTemplate(
  organizationId: string,
): Promise<DefaultBusinessHours> {
  const settings = await getOrCreateSettings(organizationId);
  return parseDefaultBusinessHoursJson(settings.defaultBusinessHoursJson);
}

export async function getOrgHolidayDateKeys(
  organizationId: string,
): Promise<Set<string>> {
  const rows = await prisma.organizationHoliday.findMany({
    where: { organizationId },
    select: { date: true },
  });
  return new Set(rows.map((r) => dateKeyLocal(r.date)));
}

async function computeCompleteness(
  organizationId: string,
  orgName: string,
  supportEmail: string | null,
  enabledTicketTypes: TicketType[],
  settings: {
    emailFromName: string | null;
    emailReplyTo: string | null;
  },
) {
  const [slaCount, enabledModuleCount] = await Promise.all([
    prisma.slaPolicy.count({ where: { organizationId } }),
    prisma.ticketModuleCatalog.count({
      where: { organizationId, enabled: true },
    }),
  ]);

  return {
    profile: orgName.trim().length >= 2 && !!supportEmail?.trim(),
    sla: slaCount > 0,
    catalog: enabledTicketTypes.length > 0 && enabledModuleCount > 0,
    communication:
      !!settings.emailFromName?.trim() && !!settings.emailReplyTo?.trim(),
  };
}

async function buildSettingsResponse(
  org: { id: string; name: string },
  settings: Parameters<typeof settingsDto>[0],
  canEdit: boolean,
) {
  const enabledTicketTypes = parseEnabledTicketTypes(settings.enabledTicketTypes);
  const completeness = await computeCompleteness(
    org.id,
    org.name,
    settings.supportEmail,
    enabledTicketTypes,
    settings,
  );
  return {
    organization: org,
    settings: settingsDto(settings),
    completeness,
    canEdit,
  };
}

async function loadPortalCatalog(organizationId: string) {
  const settings = await getOrCreateSettings(organizationId);
  const modules = await prisma.ticketModuleCatalog.findMany({
    where: { organizationId, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { key: true, label: true },
  });
  return {
    enabledTicketTypes: parseEnabledTicketTypes(settings.enabledTicketTypes),
    enabledModules: modules,
  };
}

export async function getEnabledTicketTypesForOrg(
  organizationId: string,
): Promise<TicketType[]> {
  const settings = await getOrCreateSettings(organizationId);
  return parseEnabledTicketTypes(settings.enabledTicketTypes);
}

export async function isModuleEnabledForOrg(
  organizationId: string,
  moduleKey: string,
): Promise<boolean> {
  const row = await prisma.ticketModuleCatalog.findFirst({
    where: { organizationId, key: moduleKey, enabled: true },
    select: { id: true },
  });
  return row != null;
}

export async function getSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    const settings = await getOrCreateSettings(org.id);

    return buildSettingsResponse(org, settings, canManageSettings(user));
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchOrganizationSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = PatchOrganizationSettingsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    const previousName = org.name;
    const settingsBefore = await getOrCreateSettings(org.id);

    if (parsed.data.name !== undefined) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { name: parsed.data.name.trim() },
      });
    }

    const settings = await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: {
        ...(parsed.data.supportEmail !== undefined
          ? { supportEmail: parsed.data.supportEmail }
          : {}),
        ...(parsed.data.supportPolicyText !== undefined
          ? { supportPolicyText: parsed.data.supportPolicyText }
          : {}),
      },
    });

    const updatedOrg = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      select: { id: true, name: true },
    });

    await writeAudit({
      organizationId: org.id,
      actorId: auditActor(user),
      action: "settings.organization.update",
      entityType: "organization_settings",
      entityId: org.id,
      meta: {
        previousName:
          parsed.data.name !== undefined && parsed.data.name !== previousName
            ? previousName
            : undefined,
        name: parsed.data.name,
        supportEmail:
          parsed.data.supportEmail !== undefined
            ? parsed.data.supportEmail
            : undefined,
        supportPolicyText:
          parsed.data.supportPolicyText !== undefined
            ? parsed.data.supportPolicyText
            : undefined,
        previousSupportEmail: settingsBefore.supportEmail,
      },
    });

    return buildSettingsResponse(updatedOrg, settings, true);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchPortalSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = PatchPortalSettingsBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    await getOrCreateSettings(org.id);

    if (
      parsed.data.knowledgeBaseEnabled === true &&
      parsed.data.knowledgeBaseUrl === undefined
    ) {
      const current = await prisma.organizationSettings.findUniqueOrThrow({
        where: { organizationId: org.id },
        select: { knowledgeBaseUrl: true },
      });
      if (!current.knowledgeBaseUrl?.trim()) {
        return reply.status(400).send({
          error: "knowledge_base_url_required",
          message: "Informe a URL da base de conhecimento.",
        });
      }
    }

    const settings = await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: {
        ...(parsed.data.enabledTicketTypes !== undefined
          ? {
              enabledTicketTypes: serializeEnabledTicketTypes(
                parsed.data.enabledTicketTypes,
              ),
            }
          : {}),
        ...(parsed.data.knowledgeBaseEnabled !== undefined
          ? { knowledgeBaseEnabled: parsed.data.knowledgeBaseEnabled }
          : {}),
        ...(parsed.data.knowledgeBaseUrl !== undefined
          ? { knowledgeBaseUrl: parsed.data.knowledgeBaseUrl }
          : {}),
        ...(parsed.data.portalHeroTitle !== undefined
          ? { portalHeroTitle: parsed.data.portalHeroTitle }
          : {}),
        ...(parsed.data.portalHeroSubtitle !== undefined
          ? { portalHeroSubtitle: parsed.data.portalHeroSubtitle }
          : {}),
      },
    });

    await writeAudit({
      organizationId: org.id,
      actorId: auditActor(user),
      action: "settings.portal.update",
      entityType: "organization_settings",
      entityId: org.id,
      meta: parsed.data,
    });

    return buildSettingsResponse(org, settings, true);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function listModulesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  try {
    await ensureDefaultModuleCatalog(user.organizationId);
    const modules = await prisma.ticketModuleCatalog.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return { modules, canEdit: canManageSettings(user) };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createModuleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = CreateModuleBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const maxSort = await prisma.ticketModuleCatalog.aggregate({
      where: { organizationId: user.organizationId },
      _max: { sortOrder: true },
    });
    const sortOrder =
      parsed.data.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1;

    const module = await prisma.ticketModuleCatalog.create({
      data: {
        organizationId: user.organizationId,
        key: parsed.data.key,
        label: parsed.data.label.trim(),
        sortOrder,
        enabled: parsed.data.enabled ?? true,
      },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: auditActor(user),
      action: "settings.module.create",
      entityType: "ticket_module_catalog",
      entityId: module.id,
      meta: { key: module.key, label: module.label },
    });

    return reply.status(201).send({ module });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "module_key_exists" });
    }
    throw err;
  }
}

export async function patchModuleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  const parsed = PatchModuleBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.ticketModuleCatalog.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (parsed.data.enabled === false) {
      const enabledCount = await prisma.ticketModuleCatalog.count({
        where: {
          organizationId: user.organizationId,
          enabled: true,
          id: { not: existing.id },
        },
      });
      if (enabledCount === 0) {
        return reply.status(400).send({
          error: "last_enabled_module",
          message: "Pelo menos um módulo deve permanecer ativo.",
        });
      }
    }

    const module = await prisma.ticketModuleCatalog.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.label !== undefined
          ? { label: parsed.data.label.trim() }
          : {}),
        ...(parsed.data.sortOrder !== undefined
          ? { sortOrder: parsed.data.sortOrder }
          : {}),
        ...(parsed.data.enabled !== undefined
          ? { enabled: parsed.data.enabled }
          : {}),
      },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: auditActor(user),
      action: "settings.module.update",
      entityType: "ticket_module_catalog",
      entityId: module.id,
      meta: parsed.data,
    });

    return { module };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteModuleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const existing = await prisma.ticketModuleCatalog.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    const enabledCount = await prisma.ticketModuleCatalog.count({
      where: { organizationId: user.organizationId, enabled: true },
    });
    if (existing.enabled && enabledCount <= 1) {
      return reply.status(400).send({
        error: "last_enabled_module",
        message: "Pelo menos um módulo deve permanecer ativo.",
      });
    }

    const ticketUsage = await prisma.ticket.count({
      where: {
        organizationId: user.organizationId,
        module: existing.key,
        deletedAt: null,
      },
    });
    if (ticketUsage > 0) {
      return reply.status(400).send({
        error: "module_in_use",
        message:
          "Módulo usado em chamados existentes. Desative em vez de excluir.",
      });
    }

    await prisma.ticketModuleCatalog.delete({ where: { id: existing.id } });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: auditActor(user),
      action: "settings.module.delete",
      entityType: "ticket_module_catalog",
      entityId: existing.id,
      meta: { key: existing.key },
    });

    return reply.status(204).send();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function portalSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (user.role !== "cliente") {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    const settings = await getOrCreateSettings(org.id);
    const catalog = await loadPortalCatalog(org.id);
    const businessTemplate = parseDefaultBusinessHoursJson(
      settings.defaultBusinessHoursJson,
    );
    const logoUrl = await resolveLogoUrl(settings.logoStorageKey);

    const activeOfferings = await prisma.serviceOffering.findMany({
      where: {
        organizationId: org.id,
        status: "active",
      },
      orderBy: { name: "asc" },
    });

    return {
      organizationName: org.name,
      supportEmail: settings.supportEmail,
      supportPolicyText: settings.supportPolicyText,
      logoUrl,
      portalHeroTitle: settings.portalHeroTitle,
      portalHeroSubtitle: settings.portalHeroSubtitle,
      enabledTicketTypes: catalog.enabledTicketTypes,
      enabledModules: catalog.enabledModules,
      slaTargetPct: settings.slaTargetPct,
      businessHoursSummary: formatBusinessHoursSummaryPtBr(businessTemplate),
      knowledgeBaseEnabled: settings.knowledgeBaseEnabled,
      knowledgeBaseUrl:
        settings.knowledgeBaseEnabled && settings.knowledgeBaseUrl
          ? settings.knowledgeBaseUrl
          : null,
      serviceOfferings: activeOfferings,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchEmailSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = PatchEmailSettingsBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    await getOrCreateSettings(org.id);
    const settings = await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: {
        ...(parsed.data.fromName !== undefined
          ? { emailFromName: parsed.data.fromName }
          : {}),
        ...(parsed.data.replyTo !== undefined
          ? { emailReplyTo: parsed.data.replyTo }
          : {}),
        ...(parsed.data.footerText !== undefined
          ? { emailFooterText: parsed.data.footerText }
          : {}),
        ...(parsed.data.smtpEnabled !== undefined
          ? { smtpEnabled: parsed.data.smtpEnabled }
          : {}),
        ...(parsed.data.smtpHost !== undefined
          ? { smtpHost: parsed.data.smtpHost }
          : {}),
        ...(parsed.data.smtpPort !== undefined
          ? { smtpPort: parsed.data.smtpPort }
          : {}),
        ...(parsed.data.smtpUser !== undefined
          ? { smtpUser: parsed.data.smtpUser }
          : {}),
        ...(parsed.data.smtpPass !== undefined
          ? { smtpPass: parsed.data.smtpPass }
          : {}),
        ...(parsed.data.smtpFrom !== undefined
          ? { smtpFrom: parsed.data.smtpFrom }
          : {}),
      },
    });

    const auditMeta = { ...parsed.data };
    if ("smtpPass" in auditMeta) {
      delete auditMeta.smtpPass;
    }

    await writeAudit({
      organizationId: org.id,
      actorId: auditActor(user),
      action: "settings.email.update",
      entityType: "organization_settings",
      entityId: org.id,
      meta: auditMeta,
    });

    return buildSettingsResponse(org, settings, true);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchNotificationSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = PatchNotificationSettingsBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    await getOrCreateSettings(org.id);
    const settings = await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: {
        notificationPrefsJson: serializeNotificationPrefs(
          parsed.data.notificationPrefs,
        ),
      },
    });

    await writeAudit({
      organizationId: org.id,
      actorId: auditActor(user),
      action: "settings.notifications.update",
      entityType: "organization_settings",
      entityId: org.id,
      meta: { notificationPrefs: parsed.data.notificationPrefs },
    });

    return buildSettingsResponse(org, settings, true);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function postEmailTestHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  if (!user.email) {
    return reply.status(400).send({
      error: "user_email_missing",
      message: "Usuário logado não possui e-mail.",
    });
  }

  try {
    const mail = await sendTestEmail({
      to: user.email,
      organizationId: user.organizationId,
    });
    return { mail };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchSlaSettingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = PatchSlaSettingsBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  if (
    parsed.data.defaultBusinessHours &&
    parsed.data.defaultBusinessHours.businessHourStart >=
      parsed.data.defaultBusinessHours.businessHourEnd
  ) {
    return reply.status(400).send({
      error: "invalid_body",
      message: "businessHourStart deve ser < businessHourEnd",
    });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { id: true, name: true },
    });
    if (!org) {
      return reply.status(404).send({ error: "not_found" });
    }

    await getOrCreateSettings(org.id);
    const settings = await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data: {
        ...(parsed.data.slaTargetPct !== undefined
          ? { slaTargetPct: parsed.data.slaTargetPct }
          : {}),
        ...(parsed.data.defaultBusinessHours !== undefined
          ? {
              defaultBusinessHoursJson:
                parsed.data.defaultBusinessHours === null
                  ? null
                  : serializeDefaultBusinessHours(
                      parsed.data.defaultBusinessHours,
                    ),
            }
          : {}),
      },
    });

    await writeAudit({
      organizationId: org.id,
      actorId: auditActor(user),
      action: "settings.sla.update",
      entityType: "organization_settings",
      entityId: org.id,
      meta: parsed.data,
    });

    return buildSettingsResponse(org, settings, true);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function listHolidaysHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  try {
    const holidays = await prisma.organizationHoliday.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { date: "asc" },
    });
    return { holidays, canEdit: canManageSettings(user) };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createHolidayHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const parsed = CreateHolidayBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const holiday = await prisma.organizationHoliday.create({
      data: {
        organizationId: user.organizationId,
        date: new Date(`${parsed.data.date}T12:00:00`),
        name: parsed.data.name?.trim() || null,
      },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: auditActor(user),
      action: "settings.holiday.create",
      entityType: "organization_holiday",
      entityId: holiday.id,
      meta: { date: parsed.data.date, name: parsed.data.name },
    });

    return reply.status(201).send({ holiday });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "holiday_exists" });
    }
    throw err;
  }
}

export async function deleteHolidayHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const existing = await prisma.organizationHoliday.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    await prisma.organizationHoliday.delete({ where: { id: existing.id } });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: auditActor(user),
      action: "settings.holiday.delete",
      entityType: "organization_holiday",
      entityId: existing.id,
      meta: { date: dateKeyLocal(existing.date) },
    });

    return reply.status(204).send();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function resolveLogoUrl(
  logoStorageKey: string | null | undefined,
): Promise<string | null> {
  if (!logoStorageKey) return null;
  return getPresignedDownloadUrl(logoStorageKey, 60 * 60 * 24);
}

export async function uploadOrganizationLogoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user.organizationId, reply)) return;
  if (!isStorageConfigured()) {
    return reply.status(503).send({
      error: "storage_not_configured",
      message: "Configure S3_ENDPOINT para upload de logo.",
    });
  }

  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "file_required" });
  }
  const buf = await file.toBuffer();
  if (buf.length > 2 * 1024 * 1024) {
    return reply.status(400).send({ error: "file_too_large" });
  }
  const ext =
    file.mimetype === "image/png"
      ? "png"
      : file.mimetype === "image/jpeg"
        ? "jpg"
        : file.mimetype === "image/webp"
          ? "webp"
          : null;
  if (!ext) {
    return reply.status(400).send({ error: "invalid_image_type" });
  }

  try {
    const key = `org-logos/${user.organizationId}/logo.${ext}`;
    const { storageKey } = await putObject({
      key,
      body: buf,
      contentType: file.mimetype,
    });
    await prisma.organizationSettings.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, logoStorageKey: storageKey },
      update: { logoStorageKey: storageKey },
    });
    const logoUrl = await resolveLogoUrl(storageKey);
    await writeAudit({
      organizationId: user.organizationId,
      actorId: auditActor(user),
      action: "settings.organization.logo",
      entityType: "organization_settings",
      entityId: user.organizationId,
    });
    return { ok: true, logoUrl };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
