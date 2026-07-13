import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TicketKeySchema } from "@specdriven/shared";
import type { TicketStatus } from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canManageSettings, isStaff } from "./permissions.js";
import {
  getOrgBusinessHoursTemplate,
  getOrgHolidayDateKeys,
} from "./settings.js";
import {
  addBusinessMinutes,
  businessHoursFromPolicy,
  countBusinessMinutes,
} from "./sla-calc.js";

const CreateSlaPolicySchema = z
  .object({
    clientId: z.string().uuid(),
    name: z.string().min(1).max(80).optional(),
    priorityMatch: z.string().max(64).optional(),
    responseMinutes: z.number().int().positive(),
    resolutionMinutes: z.number().int().positive(),
    businessHourStart: z.number().int().min(0).max(23).optional(),
    businessHourEnd: z.number().int().min(1).max(24).optional(),
    weekdays: z.string().min(1).max(32).optional(),
  })
  .refine(
    (b) =>
      b.businessHourStart === undefined ||
      b.businessHourEnd === undefined ||
      b.businessHourStart < b.businessHourEnd,
    { message: "businessHourStart deve ser < businessHourEnd" },
  );

const PatchSlaPolicySchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    responseMinutes: z.number().int().positive().optional(),
    resolutionMinutes: z.number().int().positive().optional(),
    businessHourStart: z.number().int().min(0).max(23).optional(),
    businessHourEnd: z.number().int().min(1).max(24).optional(),
    weekdays: z.string().min(1).max(32).optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.responseMinutes !== undefined ||
      b.resolutionMinutes !== undefined ||
      b.businessHourStart !== undefined ||
      b.businessHourEnd !== undefined ||
      b.weekdays !== undefined,
    { message: "Informe ao menos um campo" },
  );

const PAUSED_STATUSES: TicketStatus[] = ["aguardando_cliente", "cancelado"];
const DONE_STATUSES: TicketStatus[] = ["concluido", "cancelado"];

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

function requireDbOrg(user: AuthUser, reply: FastifyReply): boolean {
  if (user.organizationId === "dev-org") {
    reply.status(503).send({
      error: "database_required",
      message: "SLA exige Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
    return false;
  }
  return true;
}

export async function findSlaPolicyForTicket(opts: {
  organizationId: string;
  clientId: string;
  priority: string | null | undefined;
}) {
  const priorityMatch = (opts.priority ?? "").trim();
  if (priorityMatch) {
    const specific = await prisma.slaPolicy.findFirst({
      where: {
        organizationId: opts.organizationId,
        clientId: opts.clientId,
        priorityMatch,
      },
    });
    if (specific) return specific;
  }
  return prisma.slaPolicy.findFirst({
    where: {
      organizationId: opts.organizationId,
      clientId: opts.clientId,
      priorityMatch: "",
    },
  });
}

/** Calcula slaDueAt a partir de createdAt + resolutionMinutes em horas úteis. */
export async function computeSlaDueAt(opts: {
  organizationId: string;
  clientId: string;
  priority: string | null | undefined;
  from: Date;
}): Promise<Date | null> {
  const [policy, holidays] = await Promise.all([
    findSlaPolicyForTicket(opts),
    getOrgHolidayDateKeys(opts.organizationId),
  ]);
  if (!policy) return null;
  const cfg = businessHoursFromPolicy(policy, holidays);
  return addBusinessMinutes(opts.from, policy.resolutionMinutes, cfg);
}

export async function listSlaPoliciesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!requireDbOrg(user, reply)) return;

  const query = z
    .object({ clientId: z.string().uuid().optional() })
    .safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  try {
    const clientFilter =
      user.role === "cliente"
        ? user.clientId
          ? { clientId: user.clientId }
          : { clientId: "__none__" }
        : query.data.clientId
          ? { clientId: query.data.clientId }
          : {};

    const policies = await prisma.slaPolicy.findMany({
      where: {
        organizationId: user.organizationId,
        ...clientFilter,
      },
      orderBy: [{ clientId: "asc" }, { priorityMatch: "asc" }],
      take: 200,
    });
    return { policies };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createSlaPolicyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  const parsed = CreateSlaPolicySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        id: parsed.data.clientId,
        organizationId: user.organizationId,
      },
    });
    if (!client) {
      return reply.status(404).send({ error: "client_not_found" });
    }

    const template = await getOrgBusinessHoursTemplate(user.organizationId);

    const policy = await prisma.slaPolicy.create({
      data: {
        organizationId: user.organizationId,
        clientId: client.id,
        name: parsed.data.name ?? "default",
        priorityMatch: (parsed.data.priorityMatch ?? "").trim(),
        responseMinutes: parsed.data.responseMinutes,
        resolutionMinutes: parsed.data.resolutionMinutes,
        businessHourStart:
          parsed.data.businessHourStart ?? template.businessHourStart,
        businessHourEnd:
          parsed.data.businessHourEnd ?? template.businessHourEnd,
        weekdays: parsed.data.weekdays ?? template.weekdays,
      },
    });
    return reply.status(201).send({ policy });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "sla_policy_exists" });
    }
    throw err;
  }
}

export async function patchSlaPolicyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }
  const parsed = PatchSlaPolicySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.slaPolicy.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    const businessHourStart =
      parsed.data.businessHourStart ?? existing.businessHourStart;
    const businessHourEnd =
      parsed.data.businessHourEnd ?? existing.businessHourEnd;
    if (businessHourStart >= businessHourEnd) {
      return reply.status(400).send({
        error: "invalid_body",
        message: "businessHourStart deve ser < businessHourEnd",
      });
    }

    const policy = await prisma.slaPolicy.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.responseMinutes !== undefined
          ? { responseMinutes: parsed.data.responseMinutes }
          : {}),
        ...(parsed.data.resolutionMinutes !== undefined
          ? { resolutionMinutes: parsed.data.resolutionMinutes }
          : {}),
        ...(parsed.data.businessHourStart !== undefined
          ? { businessHourStart: parsed.data.businessHourStart }
          : {}),
        ...(parsed.data.businessHourEnd !== undefined
          ? { businessHourEnd: parsed.data.businessHourEnd }
          : {}),
        ...(parsed.data.weekdays !== undefined
          ? { weekdays: parsed.data.weekdays }
          : {}),
      },
    });
    return { policy };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteSlaPolicyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const existing = await prisma.slaPolicy.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    await prisma.slaPolicy.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getTicketSlaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        key: params.data.key,
        organizationId: user.organizationId,
        ...(user.role === "cliente" && user.clientId
          ? { clientId: user.clientId }
          : {}),
      },
    });
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    const [policy, holidays] = await Promise.all([
      findSlaPolicyForTicket({
        organizationId: ticket.organizationId,
        clientId: ticket.clientId,
        priority: ticket.priority,
      }),
      getOrgHolidayDateKeys(ticket.organizationId),
    ]);

    if (!policy) {
      return {
        sla: {
          state: "ok" as const,
          dueAt: ticket.slaDueAt,
          policy: null,
          elapsedBusinessMinutes: null,
          remainingBusinessMinutes: null,
          message: "Sem política SLA para este cliente",
        },
      };
    }

    const cfg = businessHoursFromPolicy(policy, holidays);
    const now = new Date();
    const dueAt =
      ticket.slaDueAt ??
      addBusinessMinutes(ticket.createdAt, policy.resolutionMinutes, cfg);

    let state: "ok" | "breached" | "paused" | "done" = "ok";
    if (DONE_STATUSES.includes(ticket.status)) {
      state = "done";
    } else if (PAUSED_STATUSES.includes(ticket.status)) {
      state = "paused";
    } else if (now > dueAt) {
      state = "breached";
    }

    const endForElapsed =
      ticket.resolvedAt ??
      (PAUSED_STATUSES.includes(ticket.status) ? ticket.updatedAt : now);
    const elapsedBusinessMinutes = countBusinessMinutes(
      ticket.createdAt,
      endForElapsed,
      cfg,
    );
    const remainingBusinessMinutes =
      state === "done" || state === "breached"
        ? 0
        : Math.max(
            0,
            countBusinessMinutes(now, dueAt, cfg),
          );

    return {
      sla: {
        state,
        dueAt,
        policy,
        elapsedBusinessMinutes,
        remainingBusinessMinutes,
        responseMinutes: policy.responseMinutes,
        resolutionMinutes: policy.resolutionMinutes,
        firstResponseAt: ticket.firstResponseAt,
        resolvedAt: ticket.resolvedAt,
      },
    };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export { isStaff };

export async function recalculateOpenSlaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  try {
    const open = await prisma.ticket.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { notIn: ["concluido", "cancelado"] },
      },
      select: {
        id: true,
        clientId: true,
        priority: true,
        createdAt: true,
      },
      take: 500,
    });

    let updated = 0;
    for (const t of open) {
      const slaDueAt = await computeSlaDueAt({
        organizationId: user.organizationId,
        clientId: t.clientId,
        priority: t.priority,
        from: t.createdAt,
      });
      await prisma.ticket.update({
        where: { id: t.id },
        data: { slaDueAt },
      });
      updated += 1;
    }

    return { ok: true, updated };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
