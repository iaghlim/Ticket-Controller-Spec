import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TicketKeySchema } from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

/**
 * Lista histórico de mudanças de status do ticket.
 * Cliente: só tickets do próprio clientId.
 */
export async function listTicketStatusHistoryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message:
        "Histórico de status exige Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
  }

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
      select: { id: true },
    });
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    const history = await prisma.ticketStatusHistory.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "asc" },
      include: {
        changedBy: { select: { id: true, name: true, email: true, role: true } },
      },
      take: 500,
    });
    return { history };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/** Grava entrada de histórico (usado pelo PATCH de tickets). */
export async function recordStatusChange(opts: {
  ticketId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string;
  note?: string | null;
}) {
  return prisma.ticketStatusHistory.create({
    data: {
      ticketId: opts.ticketId,
      fromStatus: opts.fromStatus as never,
      toStatus: opts.toStatus as never,
      changedById: opts.changedById,
      note: opts.note ?? null,
    },
  });
}

export type { AuthUser };
