import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { prisma, isDbUnavailableError } from "./db.js";
import { canManageProjects } from "./permissions.js";

const LinkUserProjectSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
});

const UnlinkUserProjectSchema = z.object({
  userId: z.string().uuid(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message: "Postgres indisponível.",
  });
}

/// GET /user-projects?userId=xxx — list projects linked to a user
export async function listUserProjectsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const q = request.query as { userId?: string; projectId?: string };
  try {
    const where: any = {};
    if (q.userId) where.userId = q.userId;
    if (q.projectId) where.projectId = q.projectId;
    where.active = true;

    const links = await prisma.userProject.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, code: true, clientId: true } },
        user: { select: { id: true, name: true, email: true, role: true, clientId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { links };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/// POST /projects/:id/users — link a user to a project
export async function linkUserToProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await requireAuth(request, reply);
  if (!auth) return;

  if (!canManageProjects(auth)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id: projectId } = request.params as { id: string };
  const parsed = LinkUserProjectSchema.safeParse({ ...(request.body as any), projectId });
  if (!parsed.success) {
    return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
  }

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: auth.organizationId },
    });
    if (!project) return reply.status(404).send({ error: "project_not_found" });

    const targetUser = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: auth.organizationId },
    });
    if (!targetUser) return reply.status(404).send({ error: "user_not_found" });

    const existing = await prisma.userProject.findUnique({
      where: { userId_projectId: { userId: parsed.data.userId, projectId } },
    });

    let link;
    if (existing) {
      link = await prisma.userProject.update({
        where: { id: existing.id },
        data: { active: true },
        include: { project: true, user: true },
      });
    } else {
      link = await prisma.userProject.create({
        data: { userId: parsed.data.userId, projectId },
        include: { project: true, user: true },
      });
    }

    return reply.status(201).send({ link });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/// DELETE /projects/:id/users — unlink a user from a project
export async function unlinkUserFromProjectHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const auth = await requireAuth(request, reply);
  if (!auth) return;

  if (!canManageProjects(auth)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const { id: projectId } = request.params as { id: string };
  const parsed = UnlinkUserProjectSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
  }

  try {
    const link = await prisma.userProject.findFirst({
      where: { userId: parsed.data.userId, projectId, active: true },
    });
    if (!link) return reply.status(404).send({ error: "link_not_found" });

    await prisma.userProject.update({
      where: { id: link.id },
      data: { active: false },
    });

    return { success: true };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}