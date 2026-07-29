import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, type AuthUser } from "./auth.js";
import { writeAudit } from "./audit.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canManageSettings, isStaff } from "./permissions.js";

const PatchClientBillingSchema = z.object({
  baselineHoursMonth: z.number().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
});

const PatchProjectBillingSchema = z.object({
  baselineHoursMonth: z.number().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
});

const PatchUserBillingSchema = z.object({
  hourRateFactor: z.number().positive().max(10),
});

const PatchUserProjectBillingSchema = z.object({
  hourRateFactor: z.number().positive().max(10).nullable().optional(),
});

const SummaryQuerySchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export async function patchClientBillingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  const { id } = request.params as { id: string };
  const parsed = PatchClientBillingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.client.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "not_found" });

    // Update all projects for client if batch updated
    const { baselineHoursMonth, hourlyRateCents } = parsed.data;
    if (baselineHoursMonth !== undefined || hourlyRateCents !== undefined) {
      await prisma.project.updateMany({
        where: { clientId: id, organizationId: user.organizationId },
        data: {
          ...(baselineHoursMonth !== undefined && { baselineHoursMonth }),
          ...(hourlyRateCents !== undefined && { hourlyRateCents }),
        },
      });
    }

    const client = await prisma.client.findUnique({ where: { id } });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "client.billing.update",
      entityType: "client",
      entityId: id,
      meta: parsed.data,
    });

    return { client };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export async function patchProjectBillingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  const { id } = request.params as { id: string };
  const parsed = PatchProjectBillingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.project.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "not_found" });

    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(parsed.data.baselineHoursMonth !== undefined && {
          baselineHoursMonth: parsed.data.baselineHoursMonth,
        }),
        ...(parsed.data.hourlyRateCents !== undefined && {
          hourlyRateCents: parsed.data.hourlyRateCents,
        }),
      },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "project.billing.update",
      entityType: "project",
      entityId: id,
      meta: parsed.data,
    });

    return { project: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export async function patchUserBillingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  const { id } = request.params as { id: string };
  const parsed = PatchUserBillingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.user.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "not_found" });
    if (existing.role === "cliente") {
      return reply.status(400).send({ error: "cliente_has_no_rate_factor" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { hourRateFactor: parsed.data.hourRateFactor },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        hourRateFactor: true,
      },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "user.billing.update",
      entityType: "user",
      entityId: id,
      meta: { hourRateFactor: parsed.data.hourRateFactor },
    });

    return { user: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export async function patchUserProjectBillingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  const { projectId, userId } = request.params as {
    projectId: string;
    userId: string;
  };
  const parsed = PatchUserProjectBillingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
    });
    if (!project) return reply.status(404).send({ error: "project_not_found" });

    const targetUser = await prisma.user.findFirst({
      where: { id: userId, organizationId: user.organizationId },
    });
    if (!targetUser) return reply.status(404).send({ error: "user_not_found" });

    const link = await prisma.userProject.upsert({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
      create: {
        userId,
        projectId,
        hourRateFactor: parsed.data.hourRateFactor ?? null,
      },
      update: {
        hourRateFactor: parsed.data.hourRateFactor ?? null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "user_project.billing.update",
      entityType: "user_project",
      entityId: link.id,
      meta: { projectId, userId, hourRateFactor: parsed.data.hourRateFactor },
    });

    return { link };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

/** Resumo de consumo de baseline + custo interno (fator hora). */
export async function billingSummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }

  const query = SummaryQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        id: query.data.clientId,
        organizationId: user.organizationId,
      },
    });
    if (!client) return reply.status(404).send({ error: "not_found" });

    const clientProjects = await prisma.project.findMany({
      where: {
        clientId: client.id,
        organizationId: user.organizationId,
        ...(query.data.projectId ? { id: query.data.projectId } : {}),
      },
      include: {
        userProjects: {
          where: { active: true },
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    const targetProjectIds = clientProjects.map((p) => p.id);

    const userProjectsMap: Record<string, number | null> = {};
    for (const p of clientProjects) {
      for (const up of p.userProjects) {
        if (up.hourRateFactor != null) {
          userProjectsMap[`${up.userId}_${p.id}`] = up.hourRateFactor;
        }
      }
    }

    const entries = await prisma.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        startedAt: { gte: query.data.from, lte: query.data.to },
        ticket: {
          clientId: client.id,
          projectId: { in: targetProjectIds },
          deletedAt: null,
          countsTowardBaseline: true,
        },
        approvalStatus: "approved",
      },
      include: {
        user: { select: { id: true, name: true, hourRateFactor: true } },
        ticket: {
          select: {
            key: true,
            projectId: true,
            ticketType: true,
            project: { select: { id: true, name: true, hourlyRateCents: true } },
          },
        },
      },
    });

    let secondsBaseline = 0;
    let costCentsInternal = 0;
    const byUser: Record<
      string,
      { userId: string; name: string; seconds: number; costCents: number }
    > = {};

    for (const e of entries) {
      const sec = e.seconds ?? 0;
      secondsBaseline += sec;
      const hours = sec / 3600;

      const projId = e.ticket.projectId;
      const overrideFactor = projId ? userProjectsMap[`${e.userId}_${projId}`] : undefined;
      const factor = overrideFactor ?? e.user.hourRateFactor ?? 1;

      const baseRate = e.ticket.project?.hourlyRateCents ?? 0;
      const cost = Math.round(hours * baseRate * factor);
      costCentsInternal += cost;
      const bucket = byUser[e.userId] ?? {
        userId: e.userId,
        name: e.user.name,
        seconds: 0,
        costCents: 0,
      };
      bucket.seconds += sec;
      bucket.costCents += cost;
      byUser[e.userId] = bucket;
    }

    const hoursUsed = secondsBaseline / 3600;
    const baseline = clientProjects.reduce((sum, p) => sum + (p.baselineHoursMonth ?? 0), 0);
    const avgHourlyRate =
      clientProjects.length > 0
        ? Math.round(
            clientProjects.reduce((sum, p) => sum + (p.hourlyRateCents ?? 0), 0) /
              clientProjects.length,
          )
        : 0;

    return {
      client: {
        id: client.id,
        name: client.name,
        baselineHoursMonth: baseline || null,
        hourlyRateCents: avgHourlyRate || null,
      },
      projects: clientProjects.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        baselineHoursMonth: p.baselineHoursMonth,
        hourlyRateCents: p.hourlyRateCents,
        userLinks: p.userProjects.map((up) => ({
          id: up.id,
          userId: up.userId,
          userName: up.user.name,
          userRole: up.user.role,
          hourRateFactor: up.hourRateFactor,
        })),
      })),
      range: {
        from: query.data.from.toISOString(),
        to: query.data.to.toISOString(),
      },
      hoursUsed,
      baselineRemaining:
        baseline != null ? Math.max(0, baseline - hoursUsed) : null,
      costCentsInternal,
      byUser: Object.values(byUser),
      entryCount: entries.length,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}
