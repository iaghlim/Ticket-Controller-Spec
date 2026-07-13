import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, type AuthUser } from "./auth.js";
import { writeAudit } from "./audit.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

const PullQuerySchema = z.object({
  since: z.coerce.date().optional(),
});

const PushBodySchema = z.object({
  timeEntries: z
    .array(
      z.object({
        ticketKey: z.string().min(1),
        startedAt: z.coerce.date(),
        endedAt: z.coerce.date().optional().nullable(),
        seconds: z.number().int().nonnegative().optional().nullable(),
        note: z.string().max(2000).optional().nullable(),
        clientLocalId: z.string().optional(),
      }),
    )
    .max(200)
    .optional(),
  comments: z
    .array(
      z.object({
        ticketKey: z.string().min(1),
        body: z.string().min(1).max(10000),
        visibility: z.enum(["public", "internal"]).optional(),
      }),
    )
    .max(100)
    .optional(),
});

/** Pull tickets/comentários/horas alterados desde `since` (desktop Fase D). */
export async function syncPullHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }

  const query = PullQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  const since = query.data.since;
  const serverTime = new Date();

  try {
    const ticketWhere = {
      organizationId: user.organizationId,
      deletedAt: null,
      ...(since ? { updatedAt: { gt: since } } : {}),
    };

    const tickets = await prisma.ticket.findMany({
      where: ticketWhere,
      orderBy: { updatedAt: "asc" },
      take: 500,
      include: {
        client: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    const ticketIds = tickets.map((t) => t.id);

    const comments = await prisma.comment.findMany({
      where: {
        ticket: { organizationId: user.organizationId, deletedAt: null },
        ...(since ? { createdAt: { gt: since } } : {}),
        ...(ticketIds.length && !since
          ? { ticketId: { in: ticketIds } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 1000,
      include: {
        ticket: { select: { key: true } },
        author: { select: { id: true, name: true, email: true } },
      },
    });

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        ...(since ? { createdAt: { gt: since } } : {}),
        ticket: { deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      take: 1000,
      include: {
        ticket: { select: { key: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      serverTime: serverTime.toISOString(),
      tickets,
      comments,
      timeEntries,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

/** Push horas/comentários do desktop (timer local → cloud). */
export async function syncPushHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }

  const parsed = PushBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const createdTimeEntries: Array<{
      id: string;
      clientLocalId?: string;
      ticketKey: string;
    }> = [];
    const createdComments: Array<{ id: string; ticketKey: string }> = [];

    for (const entry of parsed.data.timeEntries ?? []) {
      const ticket = await prisma.ticket.findFirst({
        where: {
          organizationId: user.organizationId,
          key: entry.ticketKey,
          deletedAt: null,
        },
      });
      if (!ticket) continue;

      let seconds = entry.seconds ?? null;
      if (seconds == null && entry.endedAt) {
        seconds = Math.max(
          0,
          Math.floor(
            (entry.endedAt.getTime() - entry.startedAt.getTime()) / 1000,
          ),
        );
      }

      const row = await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          ticketId: ticket.id,
          userId: user.id,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt ?? null,
          seconds,
          note: entry.note ?? null,
          approvalStatus: "approved",
        },
      });
      createdTimeEntries.push({
        id: row.id,
        clientLocalId: entry.clientLocalId,
        ticketKey: entry.ticketKey,
      });
    }

    for (const c of parsed.data.comments ?? []) {
      const ticket = await prisma.ticket.findFirst({
        where: {
          organizationId: user.organizationId,
          key: c.ticketKey,
          deletedAt: null,
        },
      });
      if (!ticket) continue;
      const row = await prisma.comment.create({
        data: {
          ticketId: ticket.id,
          authorId: user.id,
          body: c.body,
          visibility: c.visibility ?? "internal",
        },
      });
      createdComments.push({ id: row.id, ticketKey: c.ticketKey });
    }

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "sync.push",
      entityType: "sync",
      meta: {
        timeEntries: createdTimeEntries.length,
        comments: createdComments.length,
      },
    });

    return {
      createdTimeEntries,
      createdComments,
      serverTime: new Date().toISOString(),
    };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}
