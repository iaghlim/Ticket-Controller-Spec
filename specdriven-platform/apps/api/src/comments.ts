import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CommentVisibilitySchema, TicketKeySchema } from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { createNotification } from "./notifications.js";

const CreateCommentSchema = z.object({
  body: z.string().min(1),
  visibility: CommentVisibilitySchema.optional(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

async function findTicketForUser(user: AuthUser, key: string) {
  return prisma.ticket.findFirst({
    where: {
      key,
      deletedAt: null,
      organizationId:
        user.organizationId === "dev-org" ? undefined : user.organizationId,
      ...(user.role === "cliente" && user.clientId
        ? { clientId: user.clientId }
        : {}),
    },
  });
}

export async function listCommentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await findTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }

    const comments = await prisma.comment.findMany({
      where: {
        ticketId: ticket.id,
        ...(user.role === "cliente" ? { visibility: "public" } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return { comments };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createCommentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message:
        "Comentar exige Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
  }

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  const parsed = CreateCommentSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const visibility = parsed.data.visibility ?? "public";
  if (user.role === "cliente" && visibility === "internal") {
    return reply.status(403).send({ error: "forbidden_internal_comment" });
  }

  try {
    const ticket = await findTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }

    const comment = await prisma.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        body: parsed.data.body,
        visibility,
      },
    });

    if (ticket.assigneeId && ticket.assigneeId !== user.id) {
      await createNotification({
        organizationId: user.organizationId,
        userId: ticket.assigneeId,
        title: `Novo comentário em ${ticket.key}`,
        body: parsed.data.body.slice(0, 160),
        href: `/tickets/${ticket.key}`,
      });
    } else if (user.role === "cliente" && visibility === "public") {
      const staff = await prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          role: { in: ["gestor", "consultor"] },
        },
        select: { id: true },
        take: 20,
      });
      for (const s of staff) {
        await createNotification({
          organizationId: user.organizationId,
          userId: s.id,
          title: `Cliente comentou em ${ticket.key}`,
          body: parsed.data.body.slice(0, 160),
          href: `/tickets/${ticket.key}`,
        });
      }
    }

    return reply.status(201).send({ comment });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
