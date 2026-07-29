import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import { isStaff } from "./permissions.js";

const CreateOfferingSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1).optional().default(""),
  clientId: z.string().uuid().optional().nullable(),
  slaPolicyId: z.string().uuid().optional().nullable(),
  requiresApproval: z.boolean().optional().default(false),
  status: z.enum(["active", "draft", "retired"]).optional().default("draft"),
});

const UpdateOfferingSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  clientId: z.string().uuid().optional().nullable(),
  slaPolicyId: z.string().uuid().optional().nullable(),
  requiresApproval: z.boolean().optional(),
  status: z.enum(["active", "draft", "retired"]).optional(),
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
    message: "Catálogo de ofertas exige Postgres + login real.",
  });
}

export async function listOfferingsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const query = request.query as { clientId?: string };

  try {
    const whereClause: any = {
      organizationId: user.organizationId,
    };

    if (query.clientId) {
      whereClause.OR = [
        { clientId: null },
        { clientId: query.clientId },
      ];
    }

    const offerings = await prisma.serviceOffering.findMany({
      where: whereClause,
      include: {
        client: { select: { id: true, name: true } },
        slaPolicy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { offerings };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createOfferingHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) return staffOnly(reply);
  if (user.organizationId === "dev-org") return devOrgBlock(reply);

  const parsed = CreateOfferingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
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
        return reply.status(400).send({ error: "invalid_client_id" });
      }
    }

    if (parsed.data.slaPolicyId) {
      const policy = await prisma.slaPolicy.findFirst({
        where: {
          id: parsed.data.slaPolicyId,
          organizationId: user.organizationId,
        },
      });
      if (!policy) {
        return reply.status(400).send({ error: "invalid_sla_policy_id" });
      }
    }

    const offering = await prisma.serviceOffering.create({
      data: {
        organizationId: user.organizationId,
        clientId: parsed.data.clientId ?? null,
        name: parsed.data.name.trim(),
        description: parsed.data.description.trim(),
        slaPolicyId: parsed.data.slaPolicyId ?? null,
        requiresApproval: parsed.data.requiresApproval,
        status: parsed.data.status,
      },
      include: {
        client: { select: { id: true, name: true } },
        slaPolicy: { select: { id: true, name: true } },
      },
    });
    return reply.status(201).send({ offering });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function patchOfferingHandler(
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

  const parsed = UpdateOfferingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const existing = await prisma.serviceOffering.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    if (parsed.data.clientId) {
      const client = await prisma.client.findFirst({
        where: {
          id: parsed.data.clientId,
          organizationId: user.organizationId,
        },
      });
      if (!client) {
        return reply.status(400).send({ error: "invalid_client_id" });
      }
    }

    if (parsed.data.slaPolicyId) {
      const policy = await prisma.slaPolicy.findFirst({
        where: {
          id: parsed.data.slaPolicyId,
          organizationId: user.organizationId,
        },
      });
      if (!policy) {
        return reply.status(400).send({ error: "invalid_sla_policy_id" });
      }
    }

    const offering = await prisma.serviceOffering.update({
      where: { id: params.data.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description.trim() } : {}),
        ...(parsed.data.clientId !== undefined ? { clientId: parsed.data.clientId } : {}),
        ...(parsed.data.slaPolicyId !== undefined ? { slaPolicyId: parsed.data.slaPolicyId } : {}),
        ...(parsed.data.requiresApproval !== undefined ? { requiresApproval: parsed.data.requiresApproval } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      },
      include: {
        client: { select: { id: true, name: true } },
        slaPolicy: { select: { id: true, name: true } },
      },
    });

    return { offering };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function deleteOfferingHandler(
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
    const existing = await prisma.serviceOffering.findFirst({
      where: {
        id: params.data.id,
        organizationId: user.organizationId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: "not_found" });
    }

    const offering = await prisma.serviceOffering.update({
      where: { id: params.data.id },
      data: { status: "retired" },
    });

    return { offering };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
