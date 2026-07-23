import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import { prisma } from "./db.js";
import { signToken } from "./auth.js";

describe("Service Health & CSAT Endpoints", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let orgId: string;
  let clientId: string;
  let staffToken: string;
  let clientToken: string;
  let testTicketKey: string;
  let testTicketId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // Setup mock organization and client
    const org = await prisma.organization.create({
      data: {
        name: "Test Org Service Health",
      },
    });
    orgId = org.id;

    // Create settings for the org (required for reports)
    await prisma.organizationSettings.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        slaTargetPct: 90,
      },
      update: {},
    });

    const client = await prisma.client.create({
      data: {
        organizationId: orgId,
        name: "Test Client",
      },
    });
    clientId = client.id;

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        clientId,
        name: "TOSH Project",
        code: "TOSH",
        baselineHoursMonth: 20.0,
      },
    });
    projectId = project.id;

    // Create staff user
    const staff = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "staff@tosh.com",
        name: "Staff Member",
        role: "gestor",
        passwordHash: "hash",
      },
    });

    // Create client user
    const clientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        clientId,
        email: "client@tosh.com",
        name: "Client Member",
        role: "cliente",
        passwordHash: "hash",
      },
    });

    // Create tokens
    staffToken = signToken({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      organizationId: orgId,
      organizationName: org.name,
      clientId: null,
    });

    clientToken = signToken({
      id: clientUser.id,
      email: clientUser.email,
      name: clientUser.name,
      role: clientUser.role,
      organizationId: orgId,
      organizationName: org.name,
      clientId,
    });

    // Create a concluded/completed ticket for CSAT test
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: orgId,
        clientId,
        projectId: project.id,
        key: "TOSH-1",
        title: "Test ticket",
        status: "concluido",
        createdAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        firstResponseAt: new Date(Date.now() - 1800 * 1000), // 30 min ago
        resolvedAt: new Date(),
      },
    });
    testTicketKey = ticket.key;
    testTicketId = ticket.id;
  });

  afterAll(async () => {
    // Clean up database
    if (orgId) {
      await prisma.organization.delete({
        where: { id: orgId },
      });
    }
    await app.close();
  });

  it("GET /reports/service-health rejects client access", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reports/service-health",
      headers: {
        authorization: `Bearer ${clientToken}`,
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /reports/service-health allows staff access and returns JSON metrics", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reports/service-health",
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("mtta");
    expect(body).toHaveProperty("mttr");
    expect(body).toHaveProperty("fcr");
    expect(body).toHaveProperty("changeSuccess");
    expect(body).toHaveProperty("baselineBurn");
    expect(body).toHaveProperty("aging");
  });

  it("GET /reports/service-health.csv returns CSV file for staff", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reports/service-health.csv",
      headers: {
        authorization: `Bearer ${staffToken}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("Metric,Key,Value");
    expect(res.body).toContain("MTTA");
    expect(res.body).toContain("MTTR");
    expect(res.body).toContain("FCR");
  });

  it("POST /tickets/:key/feedback submits CSAT for completed ticket", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/tickets/${testTicketKey}/feedback`,
      headers: {
        authorization: `Bearer ${clientToken}`,
      },
      payload: {
        csatScore: 5,
        csatComment: "Excelente atendimento!",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.ticket.csatScore).toBe(5);
    expect(body.ticket.csatComment).toBe("Excelente atendimento!");

    // Verify in db
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: testTicketId },
    });
    expect(dbTicket?.csatScore).toBe(5);
    expect(dbTicket?.csatComment).toBe("Excelente atendimento!");
  });

  it("POST /tickets/:key/feedback rejects feedback for backlog/open ticket", async () => {
    // Create an open ticket
    const openTicket = await prisma.ticket.create({
      data: {
        organizationId: orgId,
        clientId,
        projectId,
        key: "TOSH-2",
        title: "Open ticket",
        status: "em_andamento",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: `/tickets/${openTicket.key}/feedback`,
      headers: {
        authorization: `Bearer ${clientToken}`,
      },
      payload: {
        csatScore: 4,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_status");

    // Clean up open ticket
    await prisma.ticket.delete({
      where: { id: openTicket.id },
    });
  });
});
