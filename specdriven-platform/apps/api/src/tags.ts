import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TicketKeySchema } from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canManageSettings, isStaff } from "./permissions.js";

const CreateTagSchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().min(1).max(32).optional().nullable(),
  visibleToClient: z.boolean().optional(),
});

const PatchTagSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    color: z.string().min(1).max(32).nullable().optional(),
    visibleToClient: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.color !== undefined ||
      b.visibleToClient !== undefined,
    {
      message: "Informe name, color e/ou visibleToClient",
    },
  );

const AssignTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()),
});

const AddTagSchema = z.object({
  tagId: z.string().uuid(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

function requireDbOrg(user: AuthUser, reply: FastifyReply): boolean {
  if (user.organizationId === "dev-org") {
    reply.status(503).send({
      error: "database_required",
      message: "Tags exigem Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
    return false;
  }
  return true;
}

export async function listTagsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!requireDbOrg(user, reply)) return;

  try {
    const tags = await prisma.tag.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      take: 500,
    });
    return { tags };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createTagHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  const parsed = CreateTagSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const tag = await prisma.tag.create({
      data: {
        organizationId: user.organizationId,
        name: parsed.data.name.trim(),
        color: parsed.data.color ?? null,
        visibleToClient: parsed.data.visibleToClient ?? false,
      },
    });
    return reply.status(201).send({ tag });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "tag_name_exists" });
    }
    throw err;
  }
}

export async function patchTagHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }
  const parsed = PatchTagSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.tag.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    const tag = await prisma.tag.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name !== undefined
          ? { name: parsed.data.name.trim() }
          : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
        ...(parsed.data.visibleToClient !== undefined
          ? { visibleToClient: parsed.data.visibleToClient }
          : {}),
      },
    });
    return { tag };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "tag_name_exists" });
    }
    throw err;
  }
}

export async function deleteTagHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!canManageSettings(user)) {
    return reply.status(403).send({ error: "forbidden_role" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const existing = await prisma.tag.findFirst({
      where: { id: params.data.id, organizationId: user.organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }
    await prisma.tag.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

async function loadTicketForUser(user: AuthUser, key: string) {
  return prisma.ticket.findFirst({
    where: {
      key,
      organizationId: user.organizationId,
      ...(user.role === "cliente" && user.clientId
        ? { clientId: user.clientId }
        : {}),
    },
  });
}

export async function listTicketTagsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await loadTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }
    const rows = await prisma.ticketTag.findMany({
      where: { ticketId: ticket.id },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });
    const tags =
      user.role === "cliente"
        ? rows.map((r) => r.tag).filter((t) => t.visibleToClient)
        : rows.map((r) => r.tag);
    return { tags };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

/** Substitui o conjunto de tags do ticket. */
export async function putTicketTagsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_staff_only" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }
  const parsed = AssignTagsSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const ticket = await loadTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }

    const uniqueIds = [...new Set(parsed.data.tagIds)];
    if (uniqueIds.length > 0) {
      const found = await prisma.tag.findMany({
        where: {
          id: { in: uniqueIds },
          organizationId: user.organizationId,
        },
      });
      if (found.length !== uniqueIds.length) {
        return reply.status(400).send({ error: "invalid_tag_ids" });
      }
    }

    await prisma.$transaction([
      prisma.ticketTag.deleteMany({ where: { ticketId: ticket.id } }),
      ...(uniqueIds.length > 0
        ? [
            prisma.ticketTag.createMany({
              data: uniqueIds.map((tagId) => ({
                ticketId: ticket.id,
                tagId,
              })),
            }),
          ]
        : []),
    ]);

    const rows = await prisma.ticketTag.findMany({
      where: { ticketId: ticket.id },
      include: { tag: true },
      orderBy: { tag: { name: "asc" } },
    });
    return { tags: rows.map((r) => r.tag) };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function addTicketTagHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_staff_only" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }
  const parsed = AddTagSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const ticket = await loadTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }
    const tag = await prisma.tag.findFirst({
      where: {
        id: parsed.data.tagId,
        organizationId: user.organizationId,
      },
    });
    if (!tag) {
      return reply.status(400).send({ error: "invalid_tag_id" });
    }

    await prisma.ticketTag.upsert({
      where: {
        ticketId_tagId: { ticketId: ticket.id, tagId: tag.id },
      },
      create: { ticketId: ticket.id, tagId: tag.id },
      update: {},
    });
    return reply.status(201).send({ tag });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function removeTicketTagHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;
  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_staff_only" });
  }
  if (!requireDbOrg(user, reply)) return;

  const params = z
    .object({ key: TicketKeySchema, tagId: z.string().uuid() })
    .safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_params" });
  }

  try {
    const ticket = await loadTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "not_found" });
    }
    await prisma.ticketTag.deleteMany({
      where: { ticketId: ticket.id, tagId: params.data.tagId },
    });
    return reply.status(204).send();
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
