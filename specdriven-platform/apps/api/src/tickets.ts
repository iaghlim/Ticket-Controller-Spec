import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  TicketKeySchema,
  TicketStatusSchema,
  TicketTypeSchema,
  TicketPrioritySchema,
} from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";
import {
  getEnabledTicketTypesForOrg,
  isModuleEnabledForOrg,
} from "./settings.js";
import { computeSlaDueAt } from "./sla.js";
import { recordStatusChange } from "./ticket-history.js";
import {
  notifyClientOnStatusChange,
  notifyClientOnTicketCreated,
} from "./ticket-notifications.js";

const CreateTicketSchema = z.object({
  key: TicketKeySchema.optional(),
  title: z.string().min(1),
  clientId: z.string().uuid(),
  description: z.string().optional().nullable(),
  status: TicketStatusSchema.optional(),
  priority: z.string().optional().nullable(),
  estimateMinutes: z.number().int().nonnegative().optional().nullable(),
  ticketType: TicketTypeSchema.optional(),
  companyName: z.string().min(1).optional().nullable(),
  module: z.string().min(1).optional().nullable(),
  countsTowardBaseline: z.boolean().optional(),
});

const ListTicketsQuerySchema = z.object({
  status: TicketStatusSchema.optional(),
});

const PatchTicketSchema = z
  .object({
    status: TicketStatusSchema.optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    ticketType: TicketTypeSchema.optional(),
    priority: TicketPrioritySchema.optional(),
    countsTowardBaseline: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.status !== undefined ||
      b.assigneeId !== undefined ||
      b.ticketType !== undefined ||
      b.priority !== undefined ||
      b.countsTowardBaseline !== undefined,
    {
      message:
        "Informe status, assigneeId, ticketType, priority e/ou countsTowardBaseline",
    },
  );

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

/** Sanitize client.code into a valid ticket key prefix (PREFIX part of PREFIX-n). */
export function ticketKeyPrefixFromCode(code: string | null | undefined): string {
  const raw = (code ?? "TK").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z][A-Z0-9]*$/.test(raw) && raw.length >= 1) {
    // Need at least one letter then optional alnum; single letter OK (e.g. A-1)
    // Regex for full key is [A-Z][A-Z0-9]+-\d+ which requires 2+ chars in PREFIX.
    if (raw.length >= 2) return raw;
    return `${raw}X`;
  }
  return "TK";
}

async function nextTicketKey(
  organizationId: string,
  prefix: string,
): Promise<string> {
  const existing = await prisma.ticket.findMany({
    where: {
      organizationId,
      key: { startsWith: `${prefix}-` },
    },
    select: { key: true },
  });

  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const row of existing) {
    const m = re.exec(row.key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

export async function listTicketsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const query = ListTicketsQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }
  const statusFilter = query.data.status;

  if (user.organizationId === "dev-org" && process.env.DEV_AUTH_BYPASS === "true") {
    // Bypass mode without DB: empty list is OK for smoke tests.
    try {
      const tickets = await prisma.ticket.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        orderBy: { updatedAt: "desc" },
        take: 100,
      });
      return { tickets };
    } catch (err) {
      if (isDbUnavailableError(err)) {
        return { tickets: [], mode: "dev_bypass_no_db" as const };
      }
      throw err;
    }
  }

  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(user.role === "cliente" && user.clientId
          ? { clientId: user.clientId }
          : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return { tickets };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createTicketHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const parsed = CreateTicketSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  if (user.role === "cliente") {
    if (!user.clientId || parsed.data.clientId !== user.clientId) {
      return reply.status(403).send({ error: "forbidden_client_scope" });
    }
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message:
        "Criar ticket exige Postgres + seed. Abra o Docker, rode db:push e seed, e faça login real (DEV_AUTH_BYPASS=false).",
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

    const ticketType = parsed.data.ticketType ?? "melhoria";
    const enabledTypes = await getEnabledTicketTypesForOrg(user.organizationId);
    if (!enabledTypes.includes(ticketType)) {
      return reply.status(400).send({
        error: "ticket_type_disabled",
        message: "Tipo de chamado não habilitado para esta consultoria.",
      });
    }

    if (parsed.data.module) {
      const moduleOk = await isModuleEnabledForOrg(
        user.organizationId,
        parsed.data.module,
      );
      if (!moduleOk) {
        return reply.status(400).send({
          error: "module_disabled",
          message: "Módulo não habilitado no catálogo da consultoria.",
        });
      }
    }

    // Cliente nunca escolhe a key; staff pode omitir para auto-gerar.
    const autoKey =
      user.role === "cliente" || !parsed.data.key
        ? await nextTicketKey(
            user.organizationId,
            ticketKeyPrefixFromCode(client.code),
          )
        : parsed.data.key;

    const priority = parsed.data.priority ?? null;
    const status = parsed.data.status ?? "backlog";
    const now = new Date();
    const slaDueAt = await computeSlaDueAt({
      organizationId: user.organizationId,
      clientId: parsed.data.clientId,
      priority,
      from: now,
    });

    const ticket = await prisma.ticket.create({
      data: {
        organizationId: user.organizationId,
        clientId: parsed.data.clientId,
        key: autoKey,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        status,
        priority,
        estimateMinutes: parsed.data.estimateMinutes ?? null,
        ticketType,
        companyName: parsed.data.companyName ?? null,
        module: parsed.data.module ?? null,
        countsTowardBaseline: parsed.data.countsTowardBaseline ?? true,
        assigneeId: user.role === "cliente" ? null : user.id,
        slaDueAt,
      },
    });

    await recordStatusChange({
      ticketId: ticket.id,
      fromStatus: null,
      toStatus: ticket.status,
      changedById: user.id,
      note: "ticket_created",
    });

    if (user.role === "cliente") {
      await notifyClientOnTicketCreated({
        organizationId: user.organizationId,
        clientId: parsed.data.clientId,
        ticketKey: ticket.key,
        authorUserId: user.id,
      });
    }

    return reply.status(201).send({ ticket });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "ticket_key_exists" });
    }
    throw err;
  }
}

export async function getTicketByKeyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        key: params.data.key,
        deletedAt: null,
        organizationId:
          user.organizationId === "dev-org" ? undefined : user.organizationId,
        ...(user.role === "cliente" && user.clientId
          ? { clientId: user.clientId }
          : {}),
      },
    });
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }
    return { ticket };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/**
 * Staff only: update status, assignee, ticketType, priority, and/or baseline flag.
 */
export async function patchTicketHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_staff_only" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message:
        "PATCH ticket exige Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
  }

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  const parsed = PatchTicketSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        key: params.data.key,
        organizationId: user.organizationId,
        deletedAt: null,
      },
      include: {
        client: { include: { users: { where: { role: "cliente" }, take: 5 } } },
      },
    });
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== null) {
      const assignee = await prisma.user.findFirst({
        where: {
          id: parsed.data.assigneeId,
          organizationId: user.organizationId,
          role: { in: ["gestor", "consultor"] },
        },
      });
      if (!assignee) {
        return reply.status(400).send({ error: "invalid_assignee" });
      }
    }

    const previousStatus = ticket.status;
    const nextStatus = parsed.data.status;
    const statusChanging =
      nextStatus !== undefined && nextStatus !== previousStatus;

    const slaExtras: {
      firstResponseAt?: Date;
      resolvedAt?: Date | null;
      slaDueAt?: Date | null;
    } = {};

    const nextPriority = parsed.data.priority;

    if (statusChanging && nextStatus) {
      if (
        !ticket.firstResponseAt &&
        previousStatus === "backlog" &&
        nextStatus !== "backlog" &&
        nextStatus !== "cancelado"
      ) {
        slaExtras.firstResponseAt = new Date();
      }
      if (nextStatus === "concluido" || nextStatus === "cancelado") {
        slaExtras.resolvedAt = new Date();
      } else if (
        previousStatus === "concluido" ||
        previousStatus === "cancelado"
      ) {
        slaExtras.resolvedAt = null;
        slaExtras.slaDueAt = await computeSlaDueAt({
          organizationId: ticket.organizationId,
          clientId: ticket.clientId,
          priority: nextPriority ?? ticket.priority,
          from: ticket.createdAt,
        });
      }
    }

    if (
      nextPriority !== undefined &&
      nextPriority !== ticket.priority &&
      ticket.status !== "concluido" &&
      ticket.status !== "cancelado"
    ) {
      slaExtras.slaDueAt = await computeSlaDueAt({
        organizationId: ticket.organizationId,
        clientId: ticket.clientId,
        priority: nextPriority,
        from: ticket.createdAt,
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(parsed.data.assigneeId !== undefined
          ? { assigneeId: parsed.data.assigneeId }
          : {}),
        ...(parsed.data.ticketType !== undefined
          ? { ticketType: parsed.data.ticketType }
          : {}),
        ...(nextPriority !== undefined ? { priority: nextPriority } : {}),
        ...(parsed.data.countsTowardBaseline !== undefined
          ? { countsTowardBaseline: parsed.data.countsTowardBaseline }
          : {}),
        ...slaExtras,
      },
    });

    let history = null;
    if (statusChanging && nextStatus) {
      history = await recordStatusChange({
        ticketId: ticket.id,
        fromStatus: previousStatus,
        toStatus: nextStatus,
        changedById: user.id,
      });

      await notifyClientOnStatusChange({
        organizationId: ticket.organizationId,
        clientId: ticket.clientId,
        ticketKey: updated.key,
        fromStatus: previousStatus,
        toStatus: updated.status,
      });
    }

    return { ticket: updated, history };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
