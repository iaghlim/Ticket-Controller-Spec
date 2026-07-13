import type { FastifyInstance } from "fastify";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

/** Hardening leve: headers de segurança + rate limit em login. */
export async function registerHardening(app: FastifyInstance): Promise<void> {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-XSS-Protection", "0");
    if (process.env.NODE_ENV === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    return payload;
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.method !== "POST" || request.url.split("?")[0] !== "/auth/login") {
      return;
    }
    const ip = request.ip || "unknown";
    const now = Date.now();
    const windowMs = 60_000;
    const max = Number(process.env.LOGIN_RATE_LIMIT ?? 30);
    let bucket = loginAttempts.get(ip);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      loginAttempts.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return reply.status(429).send({
        error: "rate_limited",
        message: "Muitas tentativas de login. Aguarde um minuto.",
      });
    }
  });
}

export function assertJwtSecretForProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret || secret === "dev-only-change-me" || secret.length < 32) {
    throw new Error(
      "JWT_SECRET fraco/ausente em produção. Defina um secret ≥ 32 chars.",
    );
  }
  if (process.env.DEV_AUTH_BYPASS === "true") {
    throw new Error("DEV_AUTH_BYPASS não permitido em produção.");
  }
}
