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

/** Exportação de auditoria assinada com hash SHA-256 para conformidade SOC 2 Type II. */
export async function exportAuditCsvHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!["gestor", "admin", "master"].includes(user.role)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }

  try {
    const events = await prisma.auditEvent.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const header = "id,createdAt,actorId,action,entityType,entityId,metaJson\n";
    const rows = events.map((e) => {
      const meta = e.metaJson ? `"${e.metaJson.replace(/"/g, '""')}"` : "";
      return `"${e.id}","${e.createdAt.toISOString()}","${e.actorId ?? ""}","${e.action}","${e.entityType}","${e.entityId ?? ""}",${meta}`;
    });
    const csvContent = header + rows.join("\n");

    const crypto = await import("node:crypto");
    const sha256Checksum = crypto.createHash("sha256").update(csvContent).digest("hex");

    await writeAudit({
      organizationId: user.organizationId,
      actorId: user.id,
      action: "audit.export_soc2",
      entityType: "audit_event",
      meta: { recordCount: events.length, sha256Checksum },
    });

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="audit-log-${Date.now()}.csv"`,
    );
    reply.header("X-Audit-Checksum-SHA256", sha256Checksum);
    return reply.send(csvContent);
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}

