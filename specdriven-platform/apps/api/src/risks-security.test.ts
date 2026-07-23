import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import { prisma } from "./db.js";
import { signToken } from "./auth.js";

describe("Risks & Security (CSRF / Cookie / SLA Warning)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let orgId: string;
  let clientId: string;
  let staffUser: any;
  let clientUser: any;
  let staffTokenWithCsrf: string;
  let staffTokenBearer: string;
  let clientToken: string;
  let projectId: string;
  const csrfToken = "my-test-csrf-token";

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Setup mock Organization
    const org = await prisma.organization.create({
      data: {
        name: "Security Test Org",
      },
    });
    orgId = org.id;

    // 2. Setup mock Client
    const client = await prisma.client.create({
      data: {
        organizationId: orgId,
        name: "Security Test Client",
      },
    });
    clientId = client.id;

    // 3. Create users
    staffUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "gestor.security@example.com",
        name: "Gestor Security",
        role: "gestor",
        passwordHash: "hash",
      },
    });

    clientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        clientId,
        email: "client.security@example.com",
        name: "Client Security",
        role: "cliente",
        passwordHash: "hash",
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        clientId,
        name: "Security Test Project",
        code: "SECP",
      },
    });
    projectId = project.id;

    // Sign tokens
    staffTokenWithCsrf = signToken({
      id: staffUser.id,
      email: staffUser.email,
      name: staffUser.name,
      role: staffUser.role,
      organizationId: orgId,
      organizationName: org.name,
      clientId: null,
    }, 60 * 60, csrfToken);

    staffTokenBearer = signToken({
      id: staffUser.id,
      email: staffUser.email,
      name: staffUser.name,
      role: staffUser.role,
      organizationId: orgId,
      organizationName: org.name,
      clientId: null,
    }, 60 * 60);

    clientToken = signToken({
      id: clientUser.id,
      email: clientUser.email,
      name: clientUser.name,
      role: clientUser.role,
      organizationId: orgId,
      organizationName: org.name,
      clientId,
    }, 60 * 60);
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({
        where: { id: orgId },
      });
    }
    await app.close();
  });

  describe("Cookie Authentication & CSRF validation", () => {
    it("POST /risks fails (403) when loaded from cookie and x-csrf-token is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          cookie: `token=${staffTokenWithCsrf}`,
        },
        payload: {
          title: "CSRF Risk test",
          probability: "High",
          impact: "Medium",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden_csrf_invalid");
    });

    it("POST /risks fails (403) when loaded from cookie and x-csrf-token is incorrect", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          cookie: `token=${staffTokenWithCsrf}`,
          "x-csrf-token": "wrong-token",
        },
        payload: {
          title: "CSRF Risk test",
          probability: "High",
          impact: "Medium",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("forbidden_csrf_invalid");
    });

    it("POST /risks succeeds (201) when loaded from cookie and x-csrf-token is correct", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          cookie: `token=${staffTokenWithCsrf}`,
          "x-csrf-token": csrfToken,
        },
        payload: {
          title: "Correct CSRF Risk",
          probability: "Low",
          impact: "Low",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().risk.title).toBe("Correct CSRF Risk");
    });

    it("POST /risks succeeds (201) when authenticated via Bearer token (no CSRF header required)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
        payload: {
          title: "Bearer Risk Test",
          probability: "Medium",
          impact: "High",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().risk.title).toBe("Bearer Risk Test");
    });
  });

  describe("Risks CRUD & Permissions", () => {
    let createdRiskId: string;

    it("POST /risks fails for client user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          authorization: `Bearer ${clientToken}`,
        },
        payload: {
          title: "Client Risk Test",
          probability: "Low",
          impact: "Low",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /risks creates risk successfully for staff", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
        payload: {
          title: "Production Risk",
          description: "Database downtime risk",
          probability: "low",
          impact: "critical",
          status: "open",
        },
      });
      expect(res.statusCode).toBe(201);
      createdRiskId = res.json().risk.id;
      expect(createdRiskId).toBeDefined();
    });

    it("GET /risks lists risks for staff", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/risks",
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().risks)).toBe(true);
      expect(res.json().risks.length).toBeGreaterThan(0);
    });

    it("GET /risks/:id retrieves specific risk", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/risks/${createdRiskId}`,
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().risk.id).toBe(createdRiskId);
    });

    it("PATCH /risks/:id updates a risk", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/risks/${createdRiskId}`,
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
        payload: {
          status: "mitigated",
          mitigation: "Redundant replica",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().risk.status).toBe("mitigated");
      expect(res.json().risk.mitigation).toBe("Redundant replica");
    });

    it("DELETE /risks/:id deletes the risk", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/risks/${createdRiskId}`,
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
      });
      expect(res.statusCode).toBe(204);

      // Verify it's gone
      const verifyRes = await app.inject({
        method: "GET",
        url: `/risks/${createdRiskId}`,
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
      });
      expect(verifyRes.statusCode).toBe(404);
    });
  });

  describe("Linking Risks with cross-tenant check", () => {
    it("fails to create risk linking to problem/change from other org (implicit context check)", async () => {
      // Create a problem in another organization
      const otherOrg = await prisma.organization.create({
        data: { name: "Other Org" },
      });

      const otherProblem = await prisma.problem.create({
        data: {
          organizationId: otherOrg.id,
          title: "Other Org Problem",
        },
      });

      // Try to create a risk in our org linked to this other problem
      const res = await app.inject({
        method: "POST",
        url: "/risks",
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
        payload: {
          title: "Risk linked to other problem",
          probability: "High",
          impact: "High",
          problemId: otherProblem.id,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_problem_id");

      // Cleanup
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe("SLA Warnings", () => {
    it("creates notifications when ticket SLA is under 2 hours, and avoids duplicates", async () => {
      // 1. Create a ticket in our organization with slaDueAt = now + 1.5 hours
      const now = new Date();
      const slaDueAt = new Date(now.getTime() + 1.5 * 60 * 60 * 1000); // 1h 30m from now

      const ticket = await prisma.ticket.create({
        data: {
          organizationId: orgId,
          clientId,
          projectId,
          key: "SEC-SLA-1",
          title: "SLA Warning Ticket",
          status: "em_andamento",
          slaDueAt,
          assigneeId: staffUser.id,
        },
      });

      // 2. Trigger check-sla routine via POST /tickets/check-sla
      const res = await app.inject({
        method: "POST",
        url: "/tickets/check-sla",
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      // 3. Check notifications table to see if staffUser got notified
      const notifications = await prisma.notification.findMany({
        where: {
          userId: staffUser.id,
          organizationId: orgId,
          href: `/tickets/${ticket.id}`,
        },
      });
      expect(notifications.length).toBe(1);
      expect(notifications[0].title).toContain("Aviso de SLA");

      // 4. Trigger SLA checks again and verify no duplicate notification was created
      const res2 = await app.inject({
        method: "POST",
        url: "/tickets/check-sla",
        headers: {
          authorization: `Bearer ${staffTokenBearer}`,
        },
      });
      expect(res2.statusCode).toBe(200);

      const notificationsAfter = await prisma.notification.findMany({
        where: {
          userId: staffUser.id,
          organizationId: orgId,
          href: `/tickets/${ticket.id}`,
        },
      });
      expect(notificationsAfter.length).toBe(1); // Still 1!
    });
  });
});
