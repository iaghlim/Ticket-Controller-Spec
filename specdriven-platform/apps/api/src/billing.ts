import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, type AuthUser } from "./auth.js";
import { writeAudit } from "./audit.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isGestor, isStaff } from "./permissions.js";

const PatchClientBillingSchema = z.object({
  baselineHoursMonth: z.number().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
});

const PatchUserBillingSchema = z.object({
  hourRateFactor: z.number().positive().max(10),
});

const SummaryQuerySchema = z.object({
  clientId: z.string().uuid(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export async function patchClientBillingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isGestor(user)) {
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

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(parsed.data.baselineHoursMonth !== undefined
          ? { baselineHoursMonth: parsed.data.baselineHoursMonth }
          : {}),
        ...(parsed.data.hourlyRateCents !== undefined
          ? { hourlyRateCents: parsed.data.hourlyRateCents }
          : {}),
      },
    });

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

export async function patchUserBillingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isGestor(user)) {
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

    const entries = await prisma.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        startedAt: { gte: query.data.from, lte: query.data.to },
        ticket: {
          clientId: client.id,
          deletedAt: null,
          countsTowardBaseline: true,
        },
        approvalStatus: "approved",
      },
      include: {
        user: { select: { id: true, name: true, hourRateFactor: true } },
        ticket: { select: { key: true, ticketType: true } },
      },
    });

    let secondsBaseline = 0;
    let costCentsInternal = 0;
    const byUser: Record<
      string,
      { userId: string; name: string; seconds: number; costCents: number }
    > = {};

    const baseRate = client.hourlyRateCents ?? 0;

    for (const e of entries) {
      const sec = e.seconds ?? 0;
      secondsBaseline += sec;
      const hours = sec / 3600;
      const factor = e.user.hourRateFactor ?? 1;
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
    const baseline = client.baselineHoursMonth ?? null;

    return {
      client: {
        id: client.id,
        name: client.name,
        baselineHoursMonth: baseline,
        hourlyRateCents: client.hourlyRateCents,
      },
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
