import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserRoleSchema } from "@specdriven/shared";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { shouldReturnInviteToken } from "./hardening.js";
import { sendInviteEmail } from "./mail.js";
import { canInvite, isStaff } from "./permissions.js";

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: UserRoleSchema,
  clientId: z.string().uuid().optional().nullable(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(16),
  name: z.string().min(1),
  password: z.string().min(8),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

export async function listInvitesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden" });
  }

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Listar convites exige Postgres + login real.",
    });
  }

  try {
    const invites = await prisma.invite.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        role: true,
        clientId: true,
        expiresAt: true,
        createdAt: true,
        acceptedAt: true,
        ...(shouldReturnInviteToken() ? { token: true } : {}),
      },
    });
    return { invites };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createInviteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message: "Convites exigem Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
  }

  const parsed = CreateInviteSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  if (!canInvite(user, parsed.data.role)) {
    return reply.status(403).send({ error: "forbidden_invite_role" });
  }

  if (parsed.data.role === "master") {
    return reply.status(400).send({
      error: "invalid_role",
      message: "Role master não pode ser convidada.",
    });
  }

  if (parsed.data.role === "admin" && user.role !== "master") {
    return reply.status(403).send({ error: "forbidden_invite_role" });
  }

  if (parsed.data.role === "cliente" && !parsed.data.clientId) {
    return reply.status(400).send({
      error: "client_id_required",
      message: "Convite com role cliente exige clientId.",
    });
  }

  if (parsed.data.role !== "cliente" && parsed.data.clientId) {
    return reply.status(400).send({
      error: "client_id_not_allowed",
      message: "Staff (gestor/consultor) não deve ter clientId no convite.",
    });
  }

  try {
    if (parsed.data.clientId) {
      const client = await prisma.client.findFirst({
        where: {
          id: parsed.data.clientId,
          organizationId: user.organizationId,
        },
      });
      if (!client) {
        return reply.status(404).send({ error: "client_not_found" });
      }
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: user.organizationId,
        email: { equals: parsed.data.email, mode: "insensitive" },
      },
    });
    if (existingUser) {
      return reply.status(409).send({ error: "user_already_exists" });
    }

    const days = parsed.data.expiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const token = randomBytes(24).toString("hex");

    const invite = await prisma.invite.create({
      data: {
        organizationId: user.organizationId,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        clientId: parsed.data.clientId ?? null,
        token,
        expiresAt,
      },
    });

    const mail = await sendInviteEmail({
      to: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      organizationId: user.organizationId,
    });

    const invitePayload: Record<string, unknown> = {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      clientId: invite.clientId,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      acceptedAt: invite.acceptedAt,
    };
    if (shouldReturnInviteToken()) {
      invitePayload.token = invite.token;
    }

    return reply.status(201).send({
      invite: invitePayload,
      mail,
    });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function acceptInviteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = AcceptInviteSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const invite = await prisma.invite.findUnique({
      where: { token: parsed.data.token },
    });
    if (!invite) {
      return reply.status(404).send({ error: "invite_not_found" });
    }
    if (invite.acceptedAt) {
      return reply.status(409).send({ error: "invite_already_accepted" });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return reply.status(410).send({ error: "invite_expired" });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: invite.organizationId,
        email: { equals: invite.email, mode: "insensitive" },
      },
    });
    if (existingUser) {
      return reply.status(409).send({ error: "user_already_exists" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: invite.organizationId,
          email: invite.email,
          name: parsed.data.name,
          passwordHash,
          role: invite.role,
          clientId: invite.clientId,
        },
      });
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });

    return reply.status(201).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        clientId: user.clientId,
      },
      message: "Convite aceito. Faça login em POST /auth/login.",
    });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return reply.status(409).send({ error: "user_already_exists" });
    }
    throw err;
  }
}
