import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

/**
 * Relatórios básicos Fase C: abertos por status e por assignee.
 * Staff only.
 */
export async function ticketsReportHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.role === "cliente") {
    return reply.status(403).send({ error: "forbidden" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Relatórios exigem Postgres + login real.",
    });
  }

  try {
    const tickets = await prisma.ticket.findMany({
      where: { organizationId: user.organizationId },
      select: { status: true, assigneeId: true },
    });

    const byStatus: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    let unassigned = 0;

    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (!t.assigneeId) {
        unassigned += 1;
      } else {
        byAssignee[t.assigneeId] = (byAssignee[t.assigneeId] ?? 0) + 1;
      }
    }

    return {
      total: tickets.length,
      byStatus,
      byAssignee,
      unassigned,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
