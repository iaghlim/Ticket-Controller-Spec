import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";

export async function createNotification(input: {
  organizationId: string;
  userId: string;
  title: string;
  body?: string | null;
  href?: string | null;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
      },
    });
  } catch {
    // Non-blocking.
  }
}

const ListQuerySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function listNotificationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const query = ListQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        ...(query.data.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.data.limit ?? 50,
    });
    const unreadCount = await prisma.notification.count({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        readAt: null,
      },
    });
    return { notifications, unreadCount };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export async function markNotificationReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  const { id } = request.params as { id: string };

  try {
    const existing = await prisma.notification.findFirst({
      where: {
        id,
        userId: user.id,
        organizationId: user.organizationId,
      },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const notification = await prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return { notification };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export async function markAllNotificationsReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  try {
    const result = await prisma.notification.updateMany({
      where: {
        organizationId: user.organizationId,
        userId: user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}
