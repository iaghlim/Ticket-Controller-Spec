import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import { prisma } from "./db.js";
import { signToken } from "./auth.js";

describe("Problems, Changes & Approvals ITIL Flow", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let orgId: string;
  let clientId: string;
  let otherClientId: string;
  let staffToken: string;
  let clientToken: string;
  let otherClientToken: string;
  let ticketId: string;
  let ticketKey: string;
  let otherTicketId: string;
  let otherTicketKey: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Setup mock Organization
    const org = await prisma.organization.create({
      data: {
        name: "Test ITIL Org",
      },
    });
    orgId = org.id;

    // 2. Setup mock Clients
    const client = await prisma.client.create({
      data: {
        organizationId: orgId,
        name: "ITIL Client A",
      },
    });
    clientId = client.id;

    const otherClient = await prisma.client.create({
      data: {
        organizationId: orgId,
        name: "ITIL Client B",
      },
    });
    otherClientId = otherClient.id;

    // 3. Create users
    const staffUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "gestor.itil@example.com",
        name: "Gestor ITIL",
        role: "gestor",
        passwordHash: "hash",
      },
    });

    const clientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        clientId,
        email: "client.a@example.com",
        name: "Client A User",
        role: "cliente",
        passwordHash: "hash",
      },
    });

    const otherClientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        clientId: otherClientId,
        email: "client.b@example.com",
        name: "Client B User",
        role: "cliente",
        passwordHash: "hash",
      },
    });

    // 4. Create sign tokens
    staffToken = signToken({
      id: staffUser.id,
      email: staffUser.email,
      name: staffUser.name,
      role: staffUser.role,
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

    otherClientToken = signToken({
      id: otherClientUser.id,
      email: otherClientUser.email,
      name: otherClientUser.name,
      role: otherClientUser.role,
      organizationId: orgId,
      organizationName: org.name,
      clientId: otherClientId,
    });

    const project = await prisma.project.create({
      data: {
        organizationId: orgId,
        clientId,
        name: "Test Project A",
        code: "TESTA",
      },
    });

    const otherProject = await prisma.project.create({
      data: {
        organizationId: orgId,
        clientId: otherClientId,
        name: "Test Project B",
        code: "TESTB",
      },
    });

    // 5. Create tickets
    const ticket = await prisma.ticket.create({
      data: {
        organizationId: orgId,
        clientId,
        projectId: project.id,
        key: "TEST-101",
        title: "Database issue",
        status: "backlog",
      },
    });
    ticketId = ticket.id;
    ticketKey = ticket.key;

    const otherTicket = await prisma.ticket.create({
      data: {
        organizationId: orgId,
        clientId: otherClientId,
        projectId: otherProject.id,
        key: "TEST-102",
        title: "UI bug on Client B dashboard",
        status: "backlog",
      },
    });
    otherTicketId = otherTicket.id;
    otherTicketKey = otherTicket.key;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({
        where: { id: orgId },
      });
    }
    await app.close();
  });

  describe("Problem Management (/problems)", () => {
    let problemId: string;

    it("POST /problems creates a new problem (staff only)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/problems",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          title: "Slow database response times",
          description: "Database queries are taking over 5 seconds under load",
          status: "investigating",
          rootCause: "Missing index on tickets table",
          workaround: "Restart Postgres container daily",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.problem.id).toBeDefined();
      expect(body.problem.title).toBe("Slow database response times");
      expect(body.problem.status).toBe("investigating");
      expect(body.problem.workaround).toBe("Restart Postgres container daily");
      problemId = body.problem.id;
    });

    it("POST /problems rejects client access", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/problems",
        headers: { authorization: `Bearer ${clientToken}` },
        payload: { title: "Attempted problem" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /problems lists problems", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/problems",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().problems.length).toBeGreaterThan(0);
    });

    it("POST /problems/:id/incidents links ticket (incident)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/problems/${problemId}/incidents`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { ticketIds: [ticketId] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it("GET /problems/:id returns problem detail with linked incidents", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/problems/${problemId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.problem.title).toBe("Slow database response times");
      expect(body.problem.incidents).toBeDefined();
      expect(body.problem.incidents.length).toBe(1);
      expect(body.problem.incidents[0].id).toBe(ticketId);
    });

    it("PATCH /problems/:id updates problem details", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/problems/${problemId}`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { status: "identified", rootCause: "Missing index on changeId column" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().problem.status).toBe("identified");
      expect(res.json().problem.rootCause).toBe("Missing index on changeId column");
    });

    it("DELETE /problems/:id/incidents/:ticketId unlinks incident", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: `/problems/${problemId}/incidents/${ticketId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      const check = await app.inject({
        method: "GET",
        url: `/problems/${problemId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(check.json().problem.incidents.length).toBe(0);
    });
  });

  describe("Change Enablement (/changes)", () => {
    let changeId: string;

    it("POST /changes creates a draft change", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/changes",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          title: "Add index to changeId on tickets",
          description: "Database optimization deployment",
          riskScore: 2,
          rollbackPlan: "Drop index",
          windowStart: new Date(),
          windowEnd: new Date(Date.now() + 3600 * 1000),
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.change.id).toBeDefined();
      expect(body.change.title).toBe("Add index to changeId on tickets");
      expect(body.change.status).toBe("draft");
      changeId = body.change.id;
    });

    it("PATCH /changes/:id updates details", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/changes/${changeId}`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { riskScore: 3 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().change.riskScore).toBe(3);
    });

    it("POST /changes/:id/submit triggers pending approval request", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/changes/${changeId}/submit`,
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().change.status).toBe("pending_approval");
      expect(res.json().approval.changeId).toBe(changeId);
      expect(res.json().approval.status).toBe("pending");
      expect(res.json().approval.kind).toBe("change");
    });

    it("POST /changes/:id/cab allows CAB decision by gestor", async () => {
      // Create another change to submit
      const anotherRes = await app.inject({
        method: "POST",
        url: "/changes",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { title: "Another CAB target" },
      });
      const targetId = anotherRes.json().change.id;

      // Submit it
      await app.inject({
        method: "POST",
        url: `/changes/${targetId}/submit`,
        headers: { authorization: `Bearer ${staffToken}` },
      });

      // Gestor makes CAB decision
      const cabRes = await app.inject({
        method: "POST",
        url: `/changes/${targetId}/cab`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: { decision: "approved", note: "Approved in CAB meeting #4" },
      });

      expect(cabRes.statusCode).toBe(200);
      expect(cabRes.json().change.status).toBe("approved");
      expect(cabRes.json().change.cabDecision).toBe("approved");

      // Verify the associated approval request is updated as well
      const detailRes = await app.inject({
        method: "GET",
        url: `/changes/${targetId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      const approvals = detailRes.json().change.approvals;
      expect(approvals[0].status).toBe("approved");
      expect(approvals[0].decisionNote).toBe("Approved in CAB meeting #4");
    });
  });

  describe("Client Role Approval (/approvals/:id/approve)", () => {
    it("allows client user to approve/reject approval request belonging to their client", async () => {
      // 1. Create a ticket status change approval request for Client A ticket
      const createRes = await app.inject({
        method: "POST",
        url: "/approvals",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          kind: "ticket",
          ticketKey,
          targetStatus: "concluido",
          reason: "Completed client tasks",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const approvalId = createRes.json().approval.id;

      // 2. Try to approve using Client B user (should be forbidden)
      const bRes = await app.inject({
        method: "POST",
        url: `/approvals/${approvalId}/approve`,
        headers: { authorization: `Bearer ${otherClientToken}` },
      });
      expect(bRes.statusCode).toBe(403);

      // 3. Approve using Client A user (should succeed)
      const aRes = await app.inject({
        method: "POST",
        url: `/approvals/${approvalId}/approve`,
        headers: { authorization: `Bearer ${clientToken}` },
        payload: { decisionNote: "Looks good, tasks verified!" },
      });
      expect(aRes.statusCode).toBe(200);
      expect(aRes.json().approval.status).toBe("approved");
    });
  });
});
