import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TicketKeySchema } from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

const CreateTimeEntrySchema = z.object({
  seconds: z.number().int().positive(),
  note: z.string().optional().nullable(),
  startedAt: z.coerce.date().optional(),
});

const RangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  clientId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

async function sumTicketSeconds(
  ticketId: string,
  statuses: Array<"pending" | "approved" | "rejected">,
): Promise<number> {
  const rows = await prisma.timeEntry.findMany({
    where: {
      ticketId,
      approvalStatus: { in: statuses },
      seconds: { not: null },
    },
    select: { seconds: true },
  });
  return rows.reduce((acc, r) => acc + (r.seconds ?? 0), 0);
}

export async function listTicketTimeEntriesHandler(
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
      message: "Time entries exigem Postgres + login real.",
    });
  }

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        organizationId: user.organizationId,
        key: params.data.key,
        deletedAt: null,
      },
    });
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where: { ticketId: ticket.id },
      orderBy: { startedAt: "desc" },
      take: 200,
    });

    const approvedSeconds = await sumTicketSeconds(ticket.id, ["approved"]);
    return {
      timeEntries,
      summary: {
        hourLimitMinutes: ticket.hourLimitMinutes,
        approvedSeconds,
        approvedMinutes: Math.ceil(approvedSeconds / 60),
      },
    };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/**
 * Lança horas no ticket.
 * Se houver hourLimitMinutes e o total approved+novo ultrapassar o limite,
 * cria entry pending + ApprovalRequest (kind=time_entry).
 */
export async function createTicketTimeEntryHandler(
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
      message: "Time entries exigem Postgres + login real.",
    });
  }

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  const parsed = CreateTimeEntrySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        organizationId: user.organizationId,
        key: params.data.key,
        deletedAt: null,
      },
    });
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    const seconds = parsed.data.seconds;
    const startedAt = parsed.data.startedAt ?? new Date();
    const endedAt = new Date(startedAt.getTime() + seconds * 1000);

    const approvedSeconds = await sumTicketSeconds(ticket.id, ["approved"]);
    const limitSeconds =
      ticket.hourLimitMinutes != null ? ticket.hourLimitMinutes * 60 : null;
    const exceeds =
      limitSeconds != null && approvedSeconds + seconds > limitSeconds;

    if (!exceeds) {
      const timeEntry = await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          ticketId: ticket.id,
          userId: user.id,
          startedAt,
          endedAt,
          seconds,
          note: parsed.data.note ?? null,
          approvalStatus: "approved",
        },
      });
      return reply.status(201).send({
        timeEntry,
        requiresApproval: false,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const timeEntry = await tx.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          ticketId: ticket.id,
          userId: user.id,
          startedAt,
          endedAt,
          seconds,
          note: parsed.data.note ?? null,
          approvalStatus: "pending",
        },
      });

      const approval = await tx.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          kind: "time_entry",
          ticketId: ticket.id,
          timeEntryId: timeEntry.id,
          requesterId: user.id,
          requestedMinutes: Math.ceil(seconds / 60),
          reason:
            parsed.data.note ??
            `Excede limite de ${ticket.hourLimitMinutes} min (já aprovados: ${Math.ceil(approvedSeconds / 60)} min)`,
        },
        include: {
          ticket: { select: { key: true, title: true, hourLimitMinutes: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
      });

      return { timeEntry, approval };
    });

    return reply.status(201).send({
      ...result,
      requiresApproval: true,
    });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/** Lista lançamentos da org em intervalo (relatórios / CSV). */
export async function listTimeEntriesRangeHandler(
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
      message: "Time entries exigem Postgres + login real.",
    });
  }

  const query = RangeQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  try {
    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        startedAt: { gte: query.data.from, lte: query.data.to },
        ...(query.data.userId ? { userId: query.data.userId } : {}),
        ...(query.data.clientId
          ? { ticket: { clientId: query.data.clientId, deletedAt: null } }
          : { ticket: { deletedAt: null } }),
      },
      include: {
        ticket: { select: { key: true, title: true, clientId: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startedAt: "asc" },
      take: 1000,
    });
    return { timeEntries };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
