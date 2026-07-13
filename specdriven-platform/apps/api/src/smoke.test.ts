import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";

describe("smoke API", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns status payload", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect([200, 503]).toContain(res.statusCode);
    const body = res.json() as { status: string; checks: Record<string, string> };
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(body.checks.database).toBeDefined();
  });

  it("POST /auth/login rejects empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /auth/forgot-password accepts email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/forgot-password",
      payload: { email: "smoke@example.com" },
    });
    expect([200, 503]).toContain(res.statusCode);
  });

  it("GET /auth/me requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
