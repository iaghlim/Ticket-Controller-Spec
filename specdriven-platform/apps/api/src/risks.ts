import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

const RiskStatusSchema = z.enum(["open", "mitigated", "accepted", "closed"]);

const CreateRiskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  probability: z.string().min(1),
  impact: z.string().min(1),
  mitigation: z.string().optional().nullable(),
  status: RiskStatusSchema.optional(),
  changeId: z.string().uuid().optional().nullable(),
  problemId: z.string().uuid().optional().nullable(),
});

const UpdateRiskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  probability: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  mitigation: z.string().optional().nullable(),
  status: RiskStatusSchema.optional(),
  changeId: z.string().uuid().optional().nullable(),
  problemId: z.string().uuid().optional().nullable(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message: "Postgres indisponível.",
  });
}

function staffOnly(reply: FastifyReply) {
  return reply.status(403).send({ error: "forbidden_staff_only" });
}

function devOrgBlock(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_required",
    message: "Gestão de riscos exige Postgres + login real.",
  });
}

export async function listRisksHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  try {
    const risks = await prisma.risk.findMany({
      where: { organizationId: user.organizationId },
      include: {
        change: {
          select: { id: true, title: true, status: true },
        },
        problem: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { risks };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createRiskHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const parsed = CreateRiskSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    if (parsed.data.changeId) {
      const changeObj = await prisma.change.findFirst({
        where: { id: parsed.data.changeId, organizationId: user.organizationId },
      });
      if (!changeObj) {
        return reply.status(400).send({ error: "invalid_change_id", message: "Change not found in organization." });
      }
    }

    if (parsed.data.problemId) {
      const problemObj = await prisma.problem.findFirst({
        where: { id: parsed.data.problemId, organizationId: user.organizationId },
      });
      if (!problemObj) {
        return reply.status(400).send({ error: "invalid_problem_id", message: "Problem not found in organization." });
      }
    }

    const risk = await prisma.risk.create({
      data: {
        organizationId: user.organizationId,
        title: parsed.data.title.trim(),
        description: parsed.data.description ?? null,
        probability: parsed.data.probability,
        impact: parsed.data.impact,
        mitigation: parsed.data.mitigation ?? null,
        status: parsed.data.status ?? "open",
        changeId: parsed.data.changeId ?? null,
        problemId: parsed.data.problemId ?? null,
      },
    });

    return reply.status(201).send({ risk });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getRiskHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const risk = await prisma.risk.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
      include: {
        change: true,
        problem: true,
      },
    });

    if (!risk) {
      return reply.status(404).send({ error: "not_found" });
    }

    return { risk };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function updateRiskHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  const parsed = UpdateRiskSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.risk.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (parsed.data.changeId) {
      const changeObj = await prisma.change.findFirst({
        where: { id: parsed.data.changeId, organizationId: user.organizationId },
      });
      if (!changeObj) {
        return reply.status(400).send({ error: "invalid_change_id", message: "Change not found in organization." });
      }
    }

    if (parsed.data.problemId) {
      const problemObj = await prisma.problem.findFirst({
        where: { id: parsed.data.problemId, organizationId: user.organizationId },
      });
      if (!problemObj) {
        return reply.status(400).send({ error: "invalid_problem_id", message: "Problem not found in organization." });
      }
    }

    const updated = await prisma.risk.update({
      where: { id: params.data.id },
      data: {
        title: parsed.data.title !== undefined ? parsed.data.title.trim() : undefined,
        description: parsed.data.description,
        probability: parsed.data.probability,
        impact: parsed.data.impact,
        mitigation: parsed.data.mitigation,
        status: parsed.data.status,
        changeId: parsed.data.changeId,
        problemId: parsed.data.problemId,
      },
    });

    return { risk: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteRiskHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const existing = await prisma.risk.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    await prisma.risk.delete({
      where: { id: params.data.id },
    });

    return reply.status(204).send();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
