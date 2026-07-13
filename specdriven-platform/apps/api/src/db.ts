import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function isDbUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string; message?: string };
  const msg = (e.message ?? "").toLowerCase();
  return (
    e.name === "PrismaClientInitializationError" ||
    e.code === "P1001" ||
    e.code === "P1000" ||
    e.code === "P1017" ||
    msg.includes("can't reach database") ||
    msg.includes("connection refused") ||
    msg.includes("econnrefused")
  );
}
