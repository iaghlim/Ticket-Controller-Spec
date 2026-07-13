import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function searchHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const query = SearchQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.status(400).send({
      error: "invalid_query",
      details: query.error.flatten(),
    });
  }

  const q = query.data.q.trim();
  const limit = query.data.limit ?? 25;

  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        ...(user.role === "cliente" && user.clientId
          ? { clientId: user.clientId }
          : {}),
        OR: [
          { key: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        clientId: true,
        updatedAt: true,
      },
    });
    return { q, tickets };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}
