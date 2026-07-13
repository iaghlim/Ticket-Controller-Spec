import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserRoleSchema } from "@specdriven/shared";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { canCreateOrgUsers, canManageOrganizations } from "./permissions.js";

const CreateOrganizationSchema = z.object({
  name: z.string().min(1),
});

const CreateOrgUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: UserRoleSchema,
  clientId: z.string().uuid().optional().nullable(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

const orgPublicSelect = {
  id: true,
  name: true,
  isMasterConsultancy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listOrganizationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageOrganizations(user)) {
    return reply.status(403).send({ error: "forbidden_master_only" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Listar consultorias exige Postgres + login real.",
    });
  }

  try {
    const organizations = await prisma.organization.findMany({
      select: orgPublicSelect,
      orderBy: { name: "asc" },
      take: 200,
    });
    return { organizations };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createOrganizationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canManageOrganizations(user)) {
    return reply.status(403).send({ error: "forbidden_master_only" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Criar consultoria exige Postgres + login real.",
    });
  }

  const parsed = CreateOrganizationSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const organization = await prisma.organization.create({
      data: {
        name: parsed.data.name.trim(),
        isMasterConsultancy: false,
      },
      select: orgPublicSelect,
    });
    return reply.status(201).send({ organization });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createOrgUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!canCreateOrgUsers(user)) {
    return reply.status(403).send({ error: "forbidden_master_only" });
  }

  const { organizationId } = request.params as { organizationId: string };
  const parsed = CreateOrgUserSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  if (parsed.data.role === "master") {
    return reply.status(400).send({
      error: "invalid_role",
      message: "Role master não pode ser atribuída via API.",
    });
  }

  if (parsed.data.role === "cliente" && !parsed.data.clientId) {
    return reply.status(400).send({
      error: "client_id_required",
      message: "Usuário cliente exige clientId.",
    });
  }

  if (parsed.data.role !== "cliente" && parsed.data.clientId) {
    return reply.status(400).send({
      error: "client_id_not_allowed",
      message: "Staff não deve ter clientId.",
    });
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      return reply.status(404).send({ error: "organization_not_found" });
    }

    if (parsed.data.clientId) {
      const client = await prisma.client.findFirst({
        where: {
          id: parsed.data.clientId,
          organizationId,
        },
      });
      if (!client) {
        return reply.status(404).send({ error: "client_not_found" });
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const created = await prisma.user.create({
      data: {
        organizationId,
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name.trim(),
        passwordHash,
        role: parsed.data.role,
        clientId: parsed.data.clientId ?? null,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        role: true,
        clientId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return reply.status(201).send({ user: created });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "user_already_exists" });
    }
    throw err;
  }
}
