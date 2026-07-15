import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canManageProjects, canManageSettings, isStaff } from "./permissions.js";

const ProjectBillingModelSchema = z.enum(["per_hour", "per_ticket", "fixed_project"]);

const CreateProjectSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  billingModel: ProjectBillingModelSchema.optional(),
  baselineHoursMonth: z.number().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
  ticketRateCents: z.number().int().nonnegative().nullable().optional(),
  budgetCents: z.number().int().nonnegative().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  slaActiveStatuses: z.string().optional(),
});

const PatchProjectSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  billingModel: ProjectBillingModelSchema.optional(),
  baselineHoursMonth: z.number().nonnegative().nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
  ticketRateCents: z.number().int().nonnegative().nullable().optional(),
  budgetCents: z.number().int().nonnegative().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  slaActiveStatuses: z.string().optional(),
});

const CreateAssignmentSchema = z.object({
  module: z.string().min(1),
  userId: z.string().uuid(),
  tier: z.enum(["N1", "N2", "N3"]),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

export async function listProjectsHandler(
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
      message: "Listar projetos exige Postgres + login real.",
    });
  }

  const clientId = (request.query as { clientId?: string }).clientId;

  try {
    const projects = await prisma.project.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { name: "asc" },
      take: 500,
    });
    return { projects };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.role === "cliente") {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id } = request.params as { id: string };

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    return { project };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageProjects(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Criar projeto exige Postgres + login real.",
    });
  }

  const parsed = CreateProjectSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const client = await prisma.client.findFirst({
      where: {
        id: parsed.data.clientId,
        organizationId: user.organizationId,
      },
    });
    if (!client) {
      return reply.status(404).send({ error: "client_not_found" });
    }

    const project = await prisma.project.create({
      data: {
        organizationId: user.organizationId,
        clientId: parsed.data.clientId,
        name: parsed.data.name.trim(),
        code: parsed.data.code.trim().toUpperCase(),
        billingModel: parsed.data.billingModel ?? "per_hour",
        baselineHoursMonth: parsed.data.baselineHoursMonth ?? null,
        hourlyRateCents: parsed.data.hourlyRateCents ?? null,
        ticketRateCents: parsed.data.ticketRateCents ?? null,
        budgetCents: parsed.data.budgetCents ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        slaActiveStatuses: parsed.data.slaActiveStatuses ?? "em_andamento",
      },
    });
    return reply.status(201).send({ project });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function updateProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageProjects(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id } = request.params as { id: string };

  const parsed = PatchProjectSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: parsed.data.name !== undefined ? parsed.data.name.trim() : undefined,
        code: parsed.data.code !== undefined ? parsed.data.code.trim().toUpperCase() : undefined,
        billingModel: parsed.data.billingModel,
        baselineHoursMonth: parsed.data.baselineHoursMonth,
        hourlyRateCents: parsed.data.hourlyRateCents,
        ticketRateCents: parsed.data.ticketRateCents,
        budgetCents: parsed.data.budgetCents,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        slaActiveStatuses: parsed.data.slaActiveStatuses,
      },
    });

    return { project: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageProjects(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id } = request.params as { id: string };

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    await prisma.project.delete({
      where: { id },
    });

    return { success: true };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

// Assignments Endpoints
export async function listAssignmentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id } = request.params as { id: string };

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const assignments = await prisma.projectModuleAssignment.findMany({
      where: { projectId: id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { assignments };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createAssignmentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id } = request.params as { id: string };

  const parsed = CreateAssignmentSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const project = await prisma.project.findFirst({
      where: {
        id,
        organizationId: user.organizationId,
      },
    });

    if (!project) {
      return reply.status(404).send({ error: "project_not_found" });
    }

    const targetUser = await prisma.user.findFirst({
      where: {
        id: parsed.data.userId,
        organizationId: user.organizationId,
      },
    });

    if (!targetUser) {
      return reply.status(404).send({ error: "user_not_found" });
    }

    // Check if assignment already exists
    const existing = await prisma.projectModuleAssignment.findFirst({
      where: {
        projectId: id,
        module: parsed.data.module,
        userId: parsed.data.userId,
        tier: parsed.data.tier,
      },
    });

    if (existing) {
      return reply.status(409).send({ error: "assignment_exists" });
    }

    const assignment = await prisma.projectModuleAssignment.create({
      data: {
        projectId: id,
        module: parsed.data.module,
        userId: parsed.data.userId,
        tier: parsed.data.tier,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return reply.status(201).send({ assignment });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteAssignmentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id } = request.params as { id: string };
  const { assignmentId } = request.params as { assignmentId?: string };
  
  // Also check query or body for the assignment ID if not in path
  const bodyId = (request.body as { id?: string })?.id || (request.body as { assignmentId?: string })?.assignmentId;
  const queryId = (request.query as { id?: string })?.id || (request.query as { assignmentId?: string })?.assignmentId;
  
  const targetId = assignmentId || bodyId || queryId;

  if (!targetId) {
    return reply.status(400).send({ error: "missing_assignment_id" });
  }

  try {
    const existing = await prisma.projectModuleAssignment.findFirst({
      where: {
        id: targetId,
        projectId: id,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "assignment_not_found" });
    }

    await prisma.projectModuleAssignment.delete({
      where: { id: targetId },
    });

    return { success: true };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
