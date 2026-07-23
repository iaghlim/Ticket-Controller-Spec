import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

const ChangeStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "implementing",
  "completed",
  "failed",
]);

const CreateChangeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  riskScore: z.number().int().min(1).max(5).default(1),
  rollbackPlan: z.string().optional().nullable(),
  windowStart: z.coerce.date().optional().nullable(),
  windowEnd: z.coerce.date().optional().nullable(),
  problemId: z.string().uuid().optional().nullable(),
});

const UpdateChangeSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  riskScore: z.number().int().min(1).max(5).optional(),
  rollbackPlan: z.string().optional().nullable(),
  windowStart: z.coerce.date().optional().nullable(),
  windowEnd: z.coerce.date().optional().nullable(),
  problemId: z.string().uuid().optional().nullable(),
  status: ChangeStatusSchema.optional(),
});

const CabDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().optional().nullable(),
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

function gestorOnly(reply: FastifyReply) {
  return reply.status(403).send({ error: "forbidden_gestor_only" });
}

function devOrgBlock(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_required",
    message: "Gestão de mudanças exige Postgres + login real.",
  });
}

export async function listChangesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  try {
    const changes = await prisma.change.findMany({
      where: { organizationId: user.organizationId },
      include: {
        problem: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { changes };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createChangeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const parsed = CreateChangeSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    if (parsed.data.problemId) {
      const problem = await prisma.problem.findFirst({
        where: {
          id: parsed.data.problemId,
          organizationId: user.organizationId,
        },
      });
      if (!problem) {
        return reply.status(404).send({ error: "problem_not_found" });
      }
    }

    const change = await prisma.change.create({
      data: {
        organizationId: user.organizationId,
        title: parsed.data.title.trim(),
        description: parsed.data.description ?? null,
        riskScore: parsed.data.riskScore,
        rollbackPlan: parsed.data.rollbackPlan ?? null,
        windowStart: parsed.data.windowStart ?? null,
        windowEnd: parsed.data.windowEnd ?? null,
        problemId: parsed.data.problemId ?? null,
        status: "draft",
      },
      include: {
        problem: {
          select: { id: true, title: true },
        },
      },
    });

    return reply.status(201).send({ change });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getChangeHandler(
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
    const change = await prisma.change.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
      include: {
        problem: { select: { id: true, title: true } },
        approvals: {
          include: {
            requester: { select: { id: true, name: true, email: true } },
            reviewer: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!change) {
      return reply.status(404).send({ error: "not_found" });
    }

    return { change };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchChangeHandler(
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

  const parsed = UpdateChangeSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.change.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (parsed.data.problemId) {
      const problem = await prisma.problem.findFirst({
        where: {
          id: parsed.data.problemId,
          organizationId: user.organizationId,
        },
      });
      if (!problem) {
        return reply.status(404).send({ error: "problem_not_found" });
      }
    }

    const change = await prisma.change.update({
      where: { id: params.data.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.riskScore !== undefined ? { riskScore: parsed.data.riskScore } : {}),
        ...(parsed.data.rollbackPlan !== undefined ? { rollbackPlan: parsed.data.rollbackPlan } : {}),
        ...(parsed.data.windowStart !== undefined ? { windowStart: parsed.data.windowStart } : {}),
        ...(parsed.data.windowEnd !== undefined ? { windowEnd: parsed.data.windowEnd } : {}),
        ...(parsed.data.problemId !== undefined ? { problemId: parsed.data.problemId } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      },
      include: {
        problem: { select: { id: true, title: true } },
      },
    });

    return { change };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function submitChangeHandler(
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
    const change = await prisma.change.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!change) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (change.status !== "draft" && change.status !== "rejected") {
      return reply.status(400).send({
        error: "cannot_submit",
        message: `Mudança está com status ${change.status} e não pode ser submetida.`,
      });
    }

    const existingPending = await prisma.approvalRequest.findFirst({
      where: {
        changeId: change.id,
        status: "pending",
      },
    });

    if (existingPending) {
      return reply.status(409).send({ error: "approval_already_pending" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedChange = await tx.change.update({
        where: { id: change.id },
        data: { status: "pending_approval" },
      });

      const approval = await tx.approvalRequest.create({
        data: {
          organizationId: user.organizationId,
          kind: "change",
          changeId: change.id,
          requesterId: user.id,
          status: "pending",
        },
      });

      return { change: updatedChange, approval };
    });

    return reply.status(200).send(result);
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function cabChangeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.role !== "gestor") return gestorOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  const parsed = CabDecisionSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const { decision, note } = parsed.data;

  try {
    const change = await prisma.change.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!change) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (change.status !== "pending_approval") {
      return reply.status(409).send({
        error: "change_not_pending_approval",
        status: change.status,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedChange = await tx.change.update({
        where: { id: change.id },
        data: {
          status: decision === "approved" ? "approved" : "rejected",
          cabDecision: decision,
          cabDecisionNote: note ?? null,
          cabDecisionAt: new Date(),
        },
        include: {
          problem: { select: { id: true, title: true } },
        },
      });

      await tx.approvalRequest.updateMany({
        where: {
          changeId: change.id,
          status: "pending",
        },
        data: {
          status: decision === "approved" ? "approved" : "rejected",
          reviewerId: user.id,
          decisionNote: note ?? null,
          decidedAt: new Date(),
        },
      });

      return updatedChange;
    });

    return { change: result };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
