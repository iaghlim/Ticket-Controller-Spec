import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ApprovalKindSchema,
  ApprovalStatusSchema,
  TicketKeySchema,
  TicketStatusSchema,
} from "@specdriven/shared";
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

const ListApprovalsQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  kind: ApprovalKindSchema.optional(),
  ticketKey: TicketKeySchema.optional(),
});

const CreateApprovalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ticket"),
    ticketKey: TicketKeySchema,
    targetStatus: TicketStatusSchema,
    reason: z.string().min(1).optional().nullable(),
  }),
  z.object({
    kind: z.literal("hour_limit"),
    ticketKey: TicketKeySchema,
    requestedMinutes: z.number().int().positive(),
    reason: z.string().min(1).optional().nullable(),
  }),
  z.object({
    kind: z.literal("time_entry"),
    ticketKey: TicketKeySchema,
    seconds: z.number().int().positive(),
    note: z.string().optional().nullable(),
    startedAt: z.coerce.date().optional(),
    reason: z.string().min(1).optional().nullable(),
  }),
]);

const DecisionBodySchema = z.object({
  decisionNote: z.string().optional().nullable(),
});

const HourLimitBodySchema = z.object({
  hourLimitMinutes: z.number().int().nonnegative().nullable(),
});

async function findTicketForStaff(
  organizationId: string,
  key: string,
) {
  return prisma.ticket.findFirst({
    where: { organizationId, key },
  });
}

export async function listApprovalsHandler(
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
      message: "Aprovações exigem Postgres + login real.",
    });
  }

  const query = ListApprovalsQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  try {
    let ticketId: string | undefined;
    if (query.data.ticketKey) {
      const ticket = await findTicketForStaff(
        user.organizationId,
        query.data.ticketKey,
      );
      if (!ticket) {
        return reply.status(404).send({ error: "ticket_not_found" });
      }
      ticketId = ticket.id;
    }

    const approvals = await prisma.approvalRequest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.kind ? { kind: query.data.kind } : {}),
        ...(ticketId ? { ticketId } : {}),
      },
      include: {
        ticket: { select: { key: true, title: true, hourLimitMinutes: true } },
        requester: { select: { id: true, name: true, email: true, role: true } },
        reviewer: { select: { id: true, name: true, email: true, role: true } },
        timeEntry: true,
        change: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return { approvals };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createApprovalHandler(
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
      message: "Aprovações exigem Postgres + login real.",
    });
  }

  const parsed = CreateApprovalSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const ticket = await findTicketForStaff(
      user.organizationId,
      parsed.data.ticketKey,
    );
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }

    if (parsed.data.kind === "ticket") {
      const existing = await prisma.approvalRequest.findFirst({
        where: {
          organizationId: user.organizationId,
          ticketId: ticket.id,
          kind: "ticket",
          status: "pending",
          targetStatus: parsed.data.targetStatus,
        },
      });
      if (existing) {
        return reply.status(409).send({
          error: "approval_already_pending",
          approval: existing,
        });
      }

      const approval = await prisma.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          kind: "ticket",
          ticketId: ticket.id,
          requesterId: user.id,
          targetStatus: parsed.data.targetStatus,
          reason: parsed.data.reason ?? null,
        },
        include: {
          ticket: { select: { key: true, title: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
      });
      return reply.status(201).send({ approval });
    }

    if (parsed.data.kind === "hour_limit") {
      const existing = await prisma.approvalRequest.findFirst({
        where: {
          organizationId: user.organizationId,
          ticketId: ticket.id,
          kind: "hour_limit",
          status: "pending",
        },
      });
      if (existing) {
        return reply.status(409).send({
          error: "approval_already_pending",
          approval: existing,
        });
      }

      const approval = await prisma.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          kind: "hour_limit",
          ticketId: ticket.id,
          requesterId: user.id,
          requestedMinutes: parsed.data.requestedMinutes,
          reason: parsed.data.reason ?? null,
        },
        include: {
          ticket: { select: { key: true, title: true, hourLimitMinutes: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
      });
      return reply.status(201).send({ approval });
    }

    // time_entry — cria lançamento pending + pedido de aprovação
    if (parsed.data.kind !== "time_entry") {
      return reply.status(400).send({ error: "invalid_approval_kind" });
    }
    const timeEntryReq = parsed.data;
    const seconds = timeEntryReq.seconds;
    const startedAt = timeEntryReq.startedAt ?? new Date();
    const endedAt = new Date(startedAt.getTime() + seconds * 1000);
    const entryNote = timeEntryReq.note ?? null;
    const entryReason = timeEntryReq.reason ?? timeEntryReq.note ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          ticketId: ticket.id,
          userId: user.id,
          startedAt,
          endedAt,
          seconds,
          note: entryNote,
          approvalStatus: "pending",
        },
      });

      const approval = await tx.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          kind: "time_entry",
          ticketId: ticket.id,
          timeEntryId: entry.id,
          requesterId: user.id,
          requestedMinutes: Math.ceil(seconds / 60),
          reason: entryReason,
        },
        include: {
          ticket: { select: { key: true, title: true, hourLimitMinutes: true } },
          requester: { select: { id: true, name: true, email: true } },
          timeEntry: true,
        },
      });

      return { approval, timeEntry: entry };
    });

    return reply.status(201).send(result);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

async function decideApproval(
  request: FastifyRequest,
  reply: FastifyReply,
  decision: "approved" | "rejected",
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Aprovações exigem Postgres + login real.",
    });
  }

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  const body = DecisionBodySchema.safeParse(request.body ?? {});
  if (!body.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: body.error.flatten(),
    });
  }

  try {
    const approval = await prisma.approvalRequest.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
      include: { timeEntry: true, ticket: true },
    });

    if (!approval) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (user.role !== "gestor") {
      if (user.role === "cliente") {
        if (!approval.ticketId || !approval.ticket || approval.ticket.clientId !== user.clientId) {
          return reply.status(403).send({ error: "forbidden" });
        }
      } else {
        return reply.status(403).send({ error: "forbidden_gestor_only" });
      }
    }

    if (approval.status !== "pending") {
      return reply.status(409).send({
        error: "approval_not_pending",
        status: approval.status,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const decided = await tx.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: decision,
          reviewerId: user.id,
          decisionNote: body.data.decisionNote ?? null,
          decidedAt: new Date(),
        },
        include: {
          ticket: {
            select: { id: true, key: true, title: true, hourLimitMinutes: true },
          },
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true, email: true } },
          timeEntry: true,
        },
      });

      if (decision === "approved") {
        if (approval.kind === "ticket" && approval.targetStatus && approval.ticketId) {
          await tx.ticket.update({
            where: { id: approval.ticketId },
            data: { status: approval.targetStatus },
          });
        }
        if (
          approval.kind === "hour_limit" &&
          approval.requestedMinutes != null &&
          approval.ticketId
        ) {
          await tx.ticket.update({
            where: { id: approval.ticketId },
            data: { hourLimitMinutes: approval.requestedMinutes },
          });
        }
        if (approval.kind === "time_entry" && approval.timeEntryId) {
          await tx.timeEntry.update({
            where: { id: approval.timeEntryId },
            data: { approvalStatus: "approved" },
          });
        }
        if (approval.kind === "change" && approval.changeId) {
          await tx.change.update({
            where: { id: approval.changeId },
            data: { status: "approved" },
          });
        }
      } else {
        if (approval.kind === "time_entry" && approval.timeEntryId) {
          await tx.timeEntry.update({
            where: { id: approval.timeEntryId },
            data: { approvalStatus: "rejected" },
          });
        }
        if (approval.kind === "change" && approval.changeId) {
          await tx.change.update({
            where: { id: approval.changeId },
            data: { status: "rejected" },
          });
        }
      }

      return decided;
    });

    return { approval: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function approveApprovalHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return decideApproval(request, reply, "approved");
}

export async function rejectApprovalHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return decideApproval(request, reply, "rejected");
}

/** Gestor define/remove limite de horas do ticket (minutos). */
export async function patchTicketHourLimitHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.role !== "gestor") {
    return reply.status(403).send({ error: "forbidden_gestor_only" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Limite de horas exige Postgres + login real.",
    });
  }

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  const parsed = HourLimitBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const ticket = await findTicketForStaff(
      user.organizationId,
      params.data.key,
    );
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { hourLimitMinutes: parsed.data.hourLimitMinutes },
    });
    return { ticket: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
