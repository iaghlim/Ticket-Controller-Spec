import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@specdriven/shared";
import { UserRoleSchema } from "@specdriven/shared";
import { isDbUnavailableError, prisma } from "./db.js";

const DEV_TOKEN = "dev-token";

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  clientId: string | null;
};

type TokenPayload = {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string;
  clientId: string | null;
  name: string;
  exp: number;
};

async function organizationNameFor(
  organizationId: string,
): Promise<string> {
  if (organizationId === "dev-org") return "Blend IT";
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  return org?.name ?? "Consultoria";
}

async function toAuthUser(dbUser: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  clientId: string | null;
}): Promise<AuthUser> {
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    organizationId: dbUser.organizationId,
    organizationName: await organizationNameFor(dbUser.organizationId),
    clientId: dbUser.clientId,
  };
}

function jwtSecret(): string {
  return process.env.JWT_SECRET ?? "dev-only-change-me";
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signToken(user: AuthUser, ttlSeconds = 60 * 60 * 12): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    clientId: user.clientId,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", jwtSecret()).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const expected = b64url(
    createHmac("sha256", jwtSecret()).update(data).digest(),
  );
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(json) as TokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const role = UserRoleSchema.safeParse(payload.role);
    if (!role.success) return null;
    return { ...payload, role: role.data };
  } catch {
    return null;
  }
}

export function isDevAuthBypass(): boolean {
  return process.env.DEV_AUTH_BYPASS === "true";
}

export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = LoginBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const { email, password } = parsed.data;

  if (isDevAuthBypass()) {
    const user: AuthUser = {
      id: "dev-user",
      email,
      name: "Dev Bypass",
      role: "gestor",
      organizationId: "dev-org",
      organizationName: "Blend IT",
      clientId: null,
    };
    return {
      token: DEV_TOKEN,
      user,
      mode: "dev_bypass" as const,
    };
  }

  try {
    const dbUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (!dbUser) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }
    const ok = await bcrypt.compare(password, dbUser.passwordHash);
    if (!ok) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }
    const user = await toAuthUser(dbUser);
    return {
      token: signToken(user),
      user,
      mode: "db" as const,
    };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({
        error: "database_unavailable",
        message:
          "Postgres indisponível. Suba o Docker (`docker compose up -d`) ou use DEV_AUTH_BYPASS=true.",
      });
    }
    throw err;
  }
}

export async function meHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await resolveAuthUser(request);
  if (!user) {
    return reply.status(401).send({ error: "unauthorized" });
  }
  const organizationName = await organizationNameFor(user.organizationId);
  return { user: { ...user, organizationName } };
}

export async function resolveAuthUser(
  request: FastifyRequest,
): Promise<AuthUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  if (isDevAuthBypass() && token === DEV_TOKEN) {
    return {
      id: "dev-user",
      email: "dev@specdriven.local",
      name: "Dev Bypass",
      role: "gestor",
      organizationId: "dev-org",
      organizationName: "Blend IT",
      clientId: null,
    };
  }

  const payload = verifyToken(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    organizationId: payload.organizationId,
    organizationName: "",
    clientId: payload.clientId,
  };
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await resolveAuthUser(request);
  if (!user) {
    await reply.status(401).send({ error: "unauthorized" });
    return null;
  }
  return user;
}
