import type { FastifyReply, FastifyRequest } from "fastify";
import { UserRoleSchema, type UserRole } from "@specdriven/shared";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

function parseRoleFilter(raw: unknown): UserRole[] | null {
  if (raw === undefined || raw === null || raw === "") return [];
  const parts = Array.isArray(raw)
    ? raw.flatMap((v) => String(v).split(","))
    : String(raw).split(",");
  const roles: UserRole[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const parsed = UserRoleSchema.safeParse(trimmed);
    if (!parsed.success) return null;
    if (!roles.includes(parsed.data)) roles.push(parsed.data);
  }
  return roles;
}

const userPublicSelect = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Staff only: lista usuários da organização (sem passwordHash).
 * Query opcional: `?role=gestor,consultor` (filtro por papéis).
 */
export async function listUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  const roles = parseRoleFilter(
    (request.query as { role?: string | string[] }).role,
  );
  if (roles === null) {
    return reply.status(400).send({
      error: "invalid_role",
      message: "role deve ser master, admin, gestor, consultor e/ou cliente",
    });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "GET /users exige Postgres + login real.",
    });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        ...(roles.length > 0 ? { role: { in: roles } } : {}),
      },
      select: userPublicSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 500,
    });
    return { users };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
