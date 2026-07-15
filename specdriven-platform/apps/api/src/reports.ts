import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

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

/**
 * Exporta todos os chamados da organização no formato CSV.
 * Staff only.
 */
export async function ticketsCsvHandler(
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
      message: "Relatórios exigem Postgres + login real.",
    });
  }

  try {
    const tickets = await prisma.ticket.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
    });

    const headers = [
      "ID",
      "Key",
      "Title",
      "Description",
      "Status",
      "Priority",
      "Type",
      "Assignee ID",
      "Estimate Minutes",
      "Hour Limit Minutes",
      "Company Name",
      "Module",
      "CSAT Score",
      "CSAT Comment",
      "SLA Due At",
      "First Response At",
      "Resolved At",
      "Created At",
      "Updated At"
    ];

    const escapeCsvCell = (val: any): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines = [headers.join(",")];
    for (const t of tickets) {
      const row = [
        t.id,
        t.key,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.ticketType,
        t.assigneeId,
        t.estimateMinutes,
        t.hourLimitMinutes,
        t.companyName,
        t.module,
        t.csatScore,
        t.csatComment,
        t.slaDueAt ? t.slaDueAt.toISOString() : "",
        t.firstResponseAt ? t.firstResponseAt.toISOString() : "",
        t.resolvedAt ? t.resolvedAt.toISOString() : "",
        t.createdAt.toISOString(),
        t.updatedAt.toISOString(),
      ];
      lines.push(row.map(escapeCsvCell).join(","));
    }

    const csvContent = lines.join("\n");

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="tickets-${user.organizationId}.csv"`
    );
    return reply.send(csvContent);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
