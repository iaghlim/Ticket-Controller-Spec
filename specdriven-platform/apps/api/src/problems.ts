import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

const ProblemStatusSchema = z.enum(["investigating", "identified", "known_error", "closed"]);

const CreateProblemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  status: ProblemStatusSchema.optional(),
  rootCause: z.string().optional().nullable(),
  workaround: z.string().optional().nullable(),
});

const UpdateProblemSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: ProblemStatusSchema.optional(),
  rootCause: z.string().optional().nullable(),
  workaround: z.string().optional().nullable(),
});

const LinkIncidentsSchema = z.object({
  ticketIds: z.array(z.string().uuid()),
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
    message: "Gestão de problemas exige Postgres + login real.",
  });
}

export async function listProblemsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  try {
    const problems = await prisma.problem.findMany({
      where: { organizationId: user.organizationId },
      include: {
        _count: {
          select: { incidents: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return { problems };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createProblemHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const parsed = CreateProblemSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const problem = await prisma.problem.create({
      data: {
        organizationId: user.organizationId,
        title: parsed.data.title.trim(),
        description: parsed.data.description ?? null,
        status: parsed.data.status ?? "investigating",
        rootCause: parsed.data.rootCause ?? null,
        workaround: parsed.data.workaround ?? null,
      },
    });
    return reply.status(201).send({ problem });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getProblemHandler(
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
    const problem = await prisma.problem.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
      include: {
        incidents: {
          include: {
            ticket: {
              select: {
                id: true,
                key: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!problem) {
      return reply.status(404).send({ error: "not_found" });
    }

    const incidents = problem.incidents.map((link) => link.ticket);

    return {
      problem: {
        ...problem,
        incidents,
      },
    };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchProblemHandler(
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

  const parsed = UpdateProblemSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.problem.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    const problem = await prisma.problem.update({
      where: { id: params.data.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.rootCause !== undefined ? { rootCause: parsed.data.rootCause } : {}),
        ...(parsed.data.workaround !== undefined ? { workaround: parsed.data.workaround } : {}),
      },
    });

    return { problem };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function linkIncidentsHandler(
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

  const parsed = LinkIncidentsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const problem = await prisma.problem.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!problem) {
      return reply.status(404).send({ error: "not_found" });
    }

    // Verify tickets belong to this organization
    const tickets = await prisma.ticket.findMany({
      where: {
        id: { in: parsed.data.ticketIds },
        organizationId: user.organizationId,
      },
      select: { id: true },
    });

    const validTicketIds = tickets.map((t) => t.id);

    if (validTicketIds.length > 0) {
      await prisma.problemIncident.createMany({
        data: validTicketIds.map((ticketId) => ({
          problemId: problem.id,
          ticketId,
        })),
        skipDuplicates: true,
      });
    }

    return reply.status(200).send({ success: true, linkedCount: validTicketIds.length });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function unlinkIncidentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({
    id: z.string().uuid(),
    ticketId: z.string().uuid(),
  }).safeParse(request.params);

  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id_or_ticket_id" });
  }

  try {
    const problem = await prisma.problem.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!problem) {
      return reply.status(404).send({ error: "not_found" });
    }

    const deleteResult = await prisma.problemIncident.deleteMany({
      where: {
        problemId: problem.id,
        ticketId: params.data.ticketId,
      },
    });

    if (deleteResult.count === 0) {
      return reply.status(404).send({ error: "incident_relation_not_found" });
    }

    return { success: true };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
