import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, isDbUnavailableError } from "./db.js";
import { sendPasswordResetEmail } from "./mail.js";

const RESET_TTL_SEC = 60 * 60;

const ForgotBodySchema = z.object({
  email: z.string().email(),
});

const ResetBodySchema = z.object({
  token: z.string().min(16),
  password: z.string().min(8),
});

function resetSecret(): string {
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

export function signPasswordResetToken(userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + RESET_TTL_SEC;
  const body = b64url(JSON.stringify({ sub: userId, purpose: "password_reset", exp, nonce }));
  const sig = b64url(
    createHmac("sha256", resetSecret()).update(body).digest(),
  );
  return `${body}.${sig}`;
}

export function verifyPasswordResetToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(
    createHmac("sha256", resetSecret()).update(body).digest(),
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
    const payload = JSON.parse(json) as {
      sub: string;
      purpose: string;
      exp: number;
    };
    if (payload.purpose !== "password_reset") return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Sempre 200 — não revela se e-mail existe. */
export async function forgotPasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = ForgotBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    const users = await prisma.user.findMany({
      where: { email },
      take: 5,
    });

    for (const dbUser of users) {
      const token = signPasswordResetToken(dbUser.id);
      const base =
        process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ??
        "http://localhost:5173";
      const portal =
        dbUser.role === "cliente"
          ? base
          : (process.env.APP_STAFF_URL?.replace(/\/$/, "") ??
            "http://localhost:5174");
      const resetUrl = `${portal}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail({
        to: dbUser.email,
        name: dbUser.name,
        resetUrl,
        organizationId: dbUser.organizationId,
      });
    }
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({
        error: "database_unavailable",
        message: "Postgres indisponível.",
      });
    }
    throw err;
  }

  return {
    ok: true,
    message:
      "Se o e-mail estiver cadastrado, você receberá instruções para redefinir a senha.",
  };
}

export async function resetPasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = ResetBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const userId = verifyPasswordResetToken(parsed.data.token);
  if (!userId) {
    return reply.status(400).send({
      error: "invalid_or_expired_token",
      message: "Link inválido ou expirado. Solicite um novo.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const updated = await prisma.user.updateMany({
      where: { id: userId },
      data: { passwordHash },
    });
    if (updated.count === 0) {
      return reply.status(404).send({ error: "user_not_found" });
    }
    return { ok: true, message: "Senha atualizada. Faça login." };
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return reply.status(503).send({ error: "database_unavailable" });
    }
    throw err;
  }
}
