import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

const CreateArticleSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  visibleToClient: z.boolean().optional().default(false),
  problemId: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
});

const UpdateArticleSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  visibleToClient: z.boolean().optional(),
  problemId: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message: "Postgres indisponível.",
  });
}

function staffOnly(reply: FastifyReply) {
  return reply.status(403).send({ error: "forbidden_staff_only" });
}

function devOrgBlock(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_required",
    message: "Gestão de conhecimento exige Postgres + login real.",
  });
}

export async function listArticlesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  try {
    if (isStaff(user)) {
      const articles = await prisma.article.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: "desc" },
      });
      return { articles };
    } else {
      const articles = await prisma.article.findMany({
        where: {
          organizationId: user.organizationId,
          status: "published",
          visibleToClient: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return { articles };
    }
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createArticleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const parsed = CreateArticleSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    if (parsed.data.problemId) {
      const problem = await prisma.problem.findFirst({
        where: {
          id: parsed.data.problemId,
          organizationId: user.organizationId,
        },
      });
      if (!problem) {
        return reply.status(400).send({ error: "invalid_problem_id" });
      }
    }

    const article = await prisma.article.create({
      data: {
        organizationId: user.organizationId,
        title: parsed.data.title.trim(),
        body: parsed.data.body.trim(),
        visibleToClient: parsed.data.visibleToClient,
        problemId: parsed.data.problemId ?? null,
        status: parsed.data.status,
      },
    });
    return reply.status(201).send({ article });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getArticleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const article = await prisma.article.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!article) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (!isStaff(user)) {
      if (article.status !== "published" || !article.visibleToClient) {
        return reply.status(404).send({ error: "not_found" });
      }
    }

    return { article };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchArticleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  const parsed = UpdateArticleSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.article.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (parsed.data.problemId) {
      const problem = await prisma.problem.findFirst({
        where: {
          id: parsed.data.problemId,
          organizationId: user.organizationId,
        },
      });
      if (!problem) {
        return reply.status(400).send({ error: "invalid_problem_id" });
      }
    }

    const article = await prisma.article.update({
      where: { id: params.data.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title.trim() } : {}),
        ...(parsed.data.body !== undefined ? { body: parsed.data.body.trim() } : {}),
        ...(parsed.data.visibleToClient !== undefined ? { visibleToClient: parsed.data.visibleToClient } : {}),
        ...(parsed.data.problemId !== undefined ? { problemId: parsed.data.problemId } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      },
    });

    return { article };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteArticleHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_id" });
  }

  try {
    const existing = await prisma.article.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    await prisma.article.delete({
      where: { id: params.data.id },
    });

    return reply.status(200).send({ success: true });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function portalListArticlesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const query = z.object({ search: z.string().optional() }).safeParse(request.query);
  const search = query.success && query.data.search ? query.data.search.trim() : "";

  try {
    const articles = await prisma.article.findMany({
      where: {
        organizationId: user.organizationId,
        status: "published",
        visibleToClient: true,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { body: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return { articles };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
