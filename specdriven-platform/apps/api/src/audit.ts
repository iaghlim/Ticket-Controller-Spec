import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";

export async function writeAudit(input: {
  organizationId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: unknown;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metaJson: input.meta != null ? JSON.stringify(input.meta) : null,
      },
    });
  } catch {
    // Audit must not break primary flows.
  }
}

const ListAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  entityType: z.string().min(1).optional(),
});

export async function listAuditHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!["gestor", "admin", "master"].includes(user.role)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }

  const query = ListAuditQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  try {
    const events = await prisma.auditEvent.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query.data.entityType
          ? { entityType: query.data.entityType }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.data.limit ?? 50,
    });
    return { events };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export function auditActor(user: AuthUser): string {
  return user.id === "dev-user" ? "dev-user" : user.id;
}
