import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TicketKeySchema, overviewPeriodRange } from "@specdriven/shared";
import { prisma, isDbUnavailableError } from "./db.js";
import { requireAuth } from "./auth.js";
import { isStaff } from "./permissions.js";
import {
  getOrgBusinessHoursTemplate,
  getOrgHolidayDateKeys,
} from "./settings.js";
import {
  businessHoursFromTemplate,
  businessHoursFromPolicy,
  countBusinessMinutes,
} from "./sla-calc.js";

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateActiveBusinessMinutes(
  createdAt: Date,
  endTime: Date,
  history: any[],
  slaActiveStatuses: string,
  cfg: any
): number {
  if (endTime.getTime() <= createdAt.getTime()) {
    return 0;
  }

  const activeList = slaActiveStatuses.split(",").map(s => s.trim().toLowerCase());
  
  // Sort history by createdAt
  const sortedHistory = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  
  let currentStatus = "backlog";
  let intervalStart = createdAt;
  let activeMinutes = 0;

  for (const h of sortedHistory) {
    if (h.createdAt.getTime() <= createdAt.getTime()) {
      currentStatus = h.toStatus;
      continue;
    }
    if (h.createdAt.getTime() >= endTime.getTime()) {
      break;
    }
    
    // Period from intervalStart to h.createdAt
    const minutes = countBusinessMinutes(intervalStart, h.createdAt, cfg);
    if (activeList.includes(currentStatus.toLowerCase())) {
      activeMinutes += minutes;
    }
    
    intervalStart = h.createdAt;
    currentStatus = h.toStatus;
  }
  
  if (intervalStart.getTime() < endTime.getTime()) {
    const minutes = countBusinessMinutes(intervalStart, endTime, cfg);
    if (activeList.includes(currentStatus.toLowerCase())) {
      activeMinutes += minutes;
    }
  }
  
  return activeMinutes;
}

export async function calculateServiceHealthMetrics(
  organizationId: string,
  periodOrDates: "current_month" | "previous_month" | "quarter" | { from: Date; to: Date } = "current_month",
  clientId?: string,
  projectId?: string
) {
  const { from, to } = typeof periodOrDates === "string"
    ? overviewPeriodRange(periodOrDates)
    : periodOrDates;

  // 1. Fetch tickets for the organization in the date range
  const tickets = await prisma.ticket.findMany({
    where: {
      organizationId,
      deletedAt: null,
      createdAt: { gte: from, lte: to },
      ...(clientId ? { clientId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    select: {
      id: true,
      clientId: true,
      projectId: true,
      priority: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      status: true,
      slaDueAt: true,
      updatedAt: true,
      project: {
        select: {
          id: true,
          code: true,
          slaActiveStatuses: true,
        },
      },
    },
  });

  // Load business hours policies, holidays, and template
  const [policies, holidays, template] = await Promise.all([
    prisma.slaPolicy.findMany({
      where: { organizationId },
    }),
    getOrgHolidayDateKeys(organizationId),
    getOrgBusinessHoursTemplate(organizationId),
  ]);

  const defaultCfg = businessHoursFromTemplate(template, holidays);

  function findPolicyForTicket(ticket: { clientId: string; priority: string | null }) {
    const priorityMatch = (ticket.priority ?? "").trim();
    if (priorityMatch) {
      const specific = policies.find(
        (p) => p.clientId === ticket.clientId && p.priorityMatch === priorityMatch
      );
      if (specific) return specific;
    }
    return policies.find(
      (p) => p.clientId === ticket.clientId && p.priorityMatch === ""
    );
  }

  // Fetch status histories for MTTA/MTTR status-discount calculation
  const historyRows = await prisma.ticketStatusHistory.findMany({
    where: {
      ticketId: { in: tickets.map((t) => t.id) },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const historyMap: Record<string, typeof historyRows> = {};
  for (const row of historyRows) {
    if (!historyMap[row.ticketId]) {
      historyMap[row.ticketId] = [];
    }
    historyMap[row.ticketId].push(row);
  }

  // Calculate MTTA and MTTR list of values
  const mttaValues: number[] = [];
  const mttrValues: number[] = [];

  for (const ticket of tickets) {
    const policy = findPolicyForTicket(ticket);
    const cfg = policy ? businessHoursFromPolicy(policy, holidays) : defaultCfg;
    const projectSlaActiveStatuses = ticket.project?.slaActiveStatuses ?? "em_andamento";
    const ticketHistory = historyMap[ticket.id] ?? [];

    if (ticket.firstResponseAt) {
      const mttaMinutes = calculateActiveBusinessMinutes(
        ticket.createdAt,
        ticket.firstResponseAt,
        ticketHistory,
        projectSlaActiveStatuses,
        cfg
      );
      mttaValues.push(mttaMinutes);
    }

    if (ticket.resolvedAt) {
      const mttrMinutes = calculateActiveBusinessMinutes(
        ticket.createdAt,
        ticket.resolvedAt,
        ticketHistory,
        projectSlaActiveStatuses,
        cfg
      );
      mttrValues.push(mttrMinutes);
    }
  }

  const mtta = median(mttaValues);
  const mttr = median(mttrValues);

  // SLA % calculation
  const ticketsWithSla = tickets.filter((t) => t.slaDueAt !== null);
  let slaPct: number | null = null;
  if (ticketsWithSla.length > 0) {
    const nowTime = new Date().getTime();
    const slaMetCount = ticketsWithSla.filter((t) => {
      const due = new Date(t.slaDueAt!).getTime();
      let completedTime: number | null = null;
      if (t.resolvedAt) completedTime = new Date(t.resolvedAt).getTime();
      else if (t.status === "concluido" || t.status === "cancelado") {
        completedTime = new Date(t.updatedAt).getTime();
      }
      if (completedTime) return completedTime <= due;
      return nowTime <= due;
    }).length;
    slaPct = (slaMetCount / ticketsWithSla.length) * 100;
  }

  // 2. FCR: % de tickets concluídos sem retrocessos
  const completedTickets = tickets.filter((t) => t.status === "concluido");
  const completedTicketIds = completedTickets.map((t) => t.id);

  let fcr: number | null = null;
  if (completedTickets.length > 0) {
    const fcrHistoryRows = await prisma.ticketStatusHistory.findMany({
      where: {
        ticketId: { in: completedTicketIds },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const fcrHistoryMap: Record<string, typeof fcrHistoryRows> = {};
    for (const row of fcrHistoryRows) {
      if (!fcrHistoryMap[row.ticketId]) {
        fcrHistoryMap[row.ticketId] = [];
      }
      fcrHistoryMap[row.ticketId].push(row);
    }

    let completedWithoutRetrogression = 0;
    for (const ticket of completedTickets) {
      const history = fcrHistoryMap[ticket.id] ?? [];
      let initiated = false;
      let progressedBeyondInProgress = false;
      let hasRetrogression = false;

      for (const h of history) {
        const to = h.toStatus;
        if (to !== "backlog") {
          initiated = true;
        }
        if (initiated) {
          if (to === "backlog") {
            hasRetrogression = true;
            break;
          }
          if (to === "em_andamento" && progressedBeyondInProgress) {
            hasRetrogression = true;
            break;
          }
          if (
            ["aguardando_cliente", "em_teste", "concluido", "cancelado"].includes(to)
          ) {
            progressedBeyondInProgress = true;
          }
        }
      }

      if (!hasRetrogression) {
        completedWithoutRetrogression++;
      }
    }

    fcr = (completedWithoutRetrogression / completedTickets.length) * 100;
  }

  // 3. changeSuccess: % de aprovações por ApprovalRequest.kind
  const approvalRequests = await prisma.approvalRequest.findMany({
    where: {
      organizationId,
      status: { in: ["approved", "rejected"] },
      createdAt: { gte: from, lte: to },
      ...(clientId ? { ticket: { clientId } } : {}),
      ...(projectId ? { ticket: { projectId } } : {}),
    },
    select: {
      kind: true,
      status: true,
    },
  });

  const changeSuccess: Record<string, number | null> = {
    ticket: null,
    hour_limit: null,
    time_entry: null,
  };

  const approvalCounts: Record<string, { approved: number; total: number }> = {
    ticket: { approved: 0, total: 0 },
    hour_limit: { approved: 0, total: 0 },
    time_entry: { approved: 0, total: 0 },
  };

  for (const req of approvalRequests) {
    const k = req.kind;
    if (approvalCounts[k]) {
      approvalCounts[k].total++;
      if (req.status === "approved") {
        approvalCounts[k].approved++;
      }
    }
  }

  for (const [k, c] of Object.entries(approvalCounts)) {
    changeSuccess[k] = c.total === 0 ? null : (c.approved / c.total) * 100;
  }

  // 4. baselineBurn
  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      ...(clientId ? { id: clientId } : {}),
    },
    select: {
      id: true,
      name: true,
    },
  });

  const timeEntries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      approvalStatus: "approved",
      startedAt: {
        gte: from,
        lte: to,
      },
      ticket: {
        deletedAt: null,
        ...(clientId ? { clientId } : {}),
        ...(projectId ? { projectId } : {}),
      },
    },
    select: {
      seconds: true,
      ticket: {
        select: {
          clientId: true,
          projectId: true,
        },
      },
    },
  });

  const clientSeconds: Record<string, number> = {};
  for (const client of clients) {
    clientSeconds[client.id] = 0;
  }
  for (const entry of timeEntries) {
    const cId = entry.ticket?.clientId;
    if (entry.seconds && cId) {
      clientSeconds[cId] = (clientSeconds[cId] ?? 0) + entry.seconds;
    }
  }

  const baselineBurn = await Promise.all(
    clients.map(async (client) => {
      const clientProjects = await prisma.project.findMany({
        where: { clientId: client.id, organizationId },
      });
      const baselineHours = clientProjects.reduce((sum, p) => sum + (p.baselineHoursMonth ?? 0), 0);
      const secondsUsed = clientSeconds[client.id] ?? 0;
      let burnPercentage: number | null = null;
      if (baselineHours && baselineHours > 0) {
        const baselineSeconds = baselineHours * 3600;
        burnPercentage = (secondsUsed / baselineSeconds) * 100;
      }
      return {
        clientId: client.id,
        clientName: client.name,
        secondsUsed,
        baselineHours,
        burnPercentage,
      };
    })
  );

  // 5. aging (snapshot of current open backlog, filtered by client if applicable)
  const aging = {
    "0-3 days": 0,
    "4-7 days": 0,
    "8-14 days": 0,
    "15-30 days": 0,
    "30+ days": 0,
  };
  const now = new Date();
  const nowTime = now.getTime();
  const activeTickets = await prisma.ticket.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ["concluido", "cancelado"] },
      ...(clientId ? { clientId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    select: {
      createdAt: true,
    },
  });

  for (const ticket of activeTickets) {
    const diffMs = nowTime - ticket.createdAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays <= 3) {
      aging["0-3 days"]++;
    } else if (diffDays <= 7) {
      aging["4-7 days"]++;
    } else if (diffDays <= 14) {
      aging["8-14 days"]++;
    } else if (diffDays <= 30) {
      aging["15-30 days"]++;
    } else {
      aging["30+ days"]++;
    }
  }

  // 6. Project Billing Metrics (throughput, ticketRevenue, budgetBurn)
  const projects = await prisma.project.findMany({
    where: {
      organizationId,
      ...(clientId ? { clientId } : {}),
      ...(projectId ? { id: projectId } : {}),
    },
  });

  let totalThroughput = 0;
  let totalTicketRevenue = 0;
  let totalBudgetCents = 0;
  let totalBurn = 0;

  for (const p of projects) {
    const pTickets = tickets.filter(t => t.projectId === p.id);
    const pCompleted = pTickets.filter(t => t.status === "concluido");
    const pThroughput = pCompleted.length;
    totalThroughput += pThroughput;

    const pTimeEntries = timeEntries.filter(e => e.ticket.projectId === p.id);
    const pSeconds = pTimeEntries.reduce((sum, e) => sum + (e.seconds ?? 0), 0);
    const pHours = pSeconds / 3600;

    let pRevenue = 0;
    let pBurn = 0;

    if (p.billingModel === "per_hour") {
      pRevenue = pHours * (p.hourlyRateCents ?? 0);
      pBurn = pRevenue;
    } else if (p.billingModel === "per_ticket") {
      pRevenue = pThroughput * (p.ticketRateCents ?? 0);
      pBurn = pRevenue;
    } else if (p.billingModel === "fixed_project") {
      pRevenue = p.budgetCents ?? 0;
      pBurn = pHours * (p.hourlyRateCents ?? 0);
    }

    totalTicketRevenue += Math.round(pRevenue);
    totalBurn += Math.round(pBurn);
    totalBudgetCents += p.budgetCents ?? 0;
  }

  const budgetBurn = totalBudgetCents > 0 ? (totalBurn / totalBudgetCents) * 100 : 0;

  return {
    mtta,
    mttr,
    fcr,
    changeSuccess,
    slaPct,
    baselineBurn,
    aging,
    throughput: totalThroughput,
    budgetBurn,
    ticketRevenue: totalTicketRevenue,
  };
}

export function generateServiceHealthCsv(data: any): string {
  const lines: string[] = ["Metric,Key,Value"];
  lines.push(`MTTA,,${data.mtta !== null ? data.mtta.toFixed(1) : ""}`);
  lines.push(`MTTR,,${data.mttr !== null ? data.mttr.toFixed(1) : ""}`);
  lines.push(`FCR,,${data.fcr !== null ? data.fcr.toFixed(1) : ""}`);
  lines.push(`SLA%,,${data.slaPct !== null ? data.slaPct.toFixed(1) : ""}`);
  for (const [kind, val] of Object.entries(data.changeSuccess)) {
    const formattedVal = val !== null ? (val as number).toFixed(1) : "";
    lines.push(`Change Success,${kind},${formattedVal}`);
  }
  for (const item of data.baselineBurn) {
    const formattedVal =
      item.burnPercentage !== null ? `${item.burnPercentage.toFixed(1)}%` : "";
    lines.push(
      `Baseline Burn,"${item.clientName} (${item.clientId})",${formattedVal}`
    );
  }
  for (const [bracket, val] of Object.entries(data.aging)) {
    lines.push(`Aging,${bracket},${val}`);
  }
  lines.push(`Throughput,,${data.throughput}`);
  lines.push(`Budget Burn,,${data.budgetBurn.toFixed(1)}%`);
  lines.push(`Ticket Revenue,,${(data.ticketRevenue / 100).toFixed(2)}`);
  return lines.join("\n");
}

export async function getServiceHealthHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Relatórios exigem Postgres + login real.",
    });
  }

  const querySchema = z.object({
    period: z.enum(["current_month", "previous_month", "quarter"]).default("current_month"),
    clientId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  });

  const parsedQuery = querySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: parsedQuery.error.flatten(),
    });
  }

  const { period, clientId, projectId } = parsedQuery.data;

  try {
    const metrics = await calculateServiceHealthMetrics(
      user.organizationId,
      period,
      clientId,
      projectId
    );
    return metrics;
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getServiceHealthCsvHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Relatórios exigem Postgres + login real.",
    });
  }

  const querySchema = z.object({
    period: z.enum(["current_month", "previous_month", "quarter"]).default("current_month"),
    clientId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  });

  const parsedQuery = querySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return reply.status(400).send({ error: "invalid_query" });
  }

  const { period, clientId, projectId } = parsedQuery.data;

  try {
    const metrics = await calculateServiceHealthMetrics(
      user.organizationId,
      period,
      clientId,
      projectId
    );
    const csvContent = generateServiceHealthCsv(metrics);

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="service-health-${period}.csv"`
    );
    return reply.send(csvContent);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getTrendsReportHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Relatórios exigem Postgres + login real.",
    });
  }

  const querySchema = z.object({
    clientId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  });

  const parsedQuery = querySchema.safeParse(request.query);
  if (!parsedQuery.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: parsedQuery.error.flatten(),
    });
  }

  const { clientId, projectId } = parsedQuery.data;

  try {
    const trends = [];
    const now = new Date();
    
    // We calculate for the last 12 months (including the current month)
    for (let i = 11; i >= 0; i--) {
      // Month calculation
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const from = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      
      const metrics = await calculateServiceHealthMetrics(
        user.organizationId,
        { from, to },
        clientId,
        projectId
      );
      
      trends.push({
        month: monthKey,
        mtta: metrics.mtta,
        mttr: metrics.mttr,
        fcr: metrics.fcr,
        slaPct: metrics.slaPct,
        throughput: metrics.throughput,
        ticketRevenue: metrics.ticketRevenue,
        budgetBurn: metrics.budgetBurn,
      });
    }

    return { trends };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function submitTicketFeedbackHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  const body = z
    .object({
      csatScore: z.number().int().min(1).max(5),
      csatComment: z.string().max(1000).optional().nullable(),
    })
    .safeParse(request.body);

  if (!body.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: body.error.flatten(),
    });
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

    if (ticket.status !== "concluido") {
      return reply.status(400).send({
        error: "invalid_status",
        message: "Feedback só pode ser enviado para chamados concluídos.",
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        csatScore: body.data.csatScore,
        csatComment: body.data.csatComment ?? null,
      },
    });

    return { success: true, ticket: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
