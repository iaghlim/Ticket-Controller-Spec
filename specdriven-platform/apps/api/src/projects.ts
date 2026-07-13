import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canManageProjects } from "./permissions.js";

const CreateProjectSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1).optional().nullable(),
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
        code: parsed.data.code ?? null,
      },
    });
    return reply.status(201).send({ project });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
