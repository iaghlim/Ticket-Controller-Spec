import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "./auth.js";
import { writeAudit } from "./audit.js";
import { isDbUnavailableError, prisma } from "./db.js";

/** Exportação LGPD dos dados do usuário autenticado. */
export async function privacyExportHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  try {
    const dbUser = await prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        clientId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!dbUser) return reply.status(404).send({ error: "not_found" });

    const comments = await prisma.comment.findMany({
      where: { authorId: user.id },
      select: {
        id: true,
        body: true,
        visibility: true,
        createdAt: true,
        ticket: { select: { key: true } },
      },
      take: 2000,
    });

    const timeEntries = await prisma.timeEntry.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        seconds: true,
        note: true,
        ticket: { select: { key: true } },
      },
      take: 5000,
    });

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
      take: 500,
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "privacy.export",
      entityType: "user",
      entityId: user.id,
    });

    return {
      exportedAt: new Date().toISOString(),
      user: dbUser,
      comments,
      timeEntries,
      notifications,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

/**
 * Soft-anonymize do usuário (LGPD delete request).
 * Mantém integridade referencial; e-mail vira tombstone.
 */
export async function privacyDeleteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  try {
    const stamp = Date.now();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: `deleted+${stamp}@anon.local`,
        name: "Usuário removido",
        passwordHash: "!",
      },
      select: { id: true, email: true, name: true },
    });

    await prisma.notification.deleteMany({ where: { userId: user.id } });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "privacy.delete",
      entityType: "user",
      entityId: user.id,
    });

    return { deleted: true, user: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

/** Soft-delete de ticket (lixeira). Staff only. */
export async function softDeleteTicketHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (user.role !== "gestor" && user.role !== "consultor") {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  const { key } = request.params as { key: string };

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        organizationId: user.organizationId,
        key,
        deletedAt: null,
      },
    });
    if (!ticket) return reply.status(404).send({ error: "not_found" });

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { deletedAt: new Date() },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "ticket.soft_delete",
      entityType: "ticket",
      entityId: ticket.id,
      meta: { key },
    });

    return { ticket: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

export async function restoreTicketHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (user.role !== "gestor") {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  const { key } = request.params as { key: string };

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        organizationId: user.organizationId,
        key,
        deletedAt: { not: null },
      },
    });
    if (!ticket) return reply.status(404).send({ error: "not_found" });

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { deletedAt: null },
    });

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "ticket.restore",
      entityType: "ticket",
      entityId: ticket.id,
      meta: { key },
    });

    return { ticket: updated };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}
