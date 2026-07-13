import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canManageClients } from "./permissions.js";

const CreateClientSchema = z.object({
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

export async function listClientsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") {
    try {
      const clients = await prisma.client.findMany({
        orderBy: { name: "asc" },
        take: 200,
      });
      return { clients };
    } catch (err) {
      if (isDbUnavailableError(err)) {
        return { clients: [], mode: "dev_bypass_no_db" as const };
      }
      throw err;
    }
  }

  try {
    if (user.role === "cliente") {
      if (!user.clientId) {
        return { clients: [] };
      }
      const clients = await prisma.client.findMany({
        where: {
          organizationId: user.organizationId,
          id: user.clientId,
        },
      });
      return { clients };
    }

    const clients = await prisma.client.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      take: 200,
    });
    return { clients };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createClientHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageClients(user) || user.organizationId === "dev-org") {
    if (user.organizationId === "dev-org") {
      return reply.status(503).send({
        error: "database_required",
        message:
          "Criar cliente exige Postgres + login real (DEV_AUTH_BYPASS=false).",
      });
    }
    return reply.status(403).send({ error: "forbidden" });
  }

  const parsed = CreateClientSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const client = await prisma.client.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.data.name,
        code: parsed.data.code ?? null,
      },
    });
    return reply.status(201).send({ client });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
