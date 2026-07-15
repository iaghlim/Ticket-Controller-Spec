import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import { prisma } from "./db.js";
import { signToken } from "./auth.js";

describe("Knowledge & Service Offerings (Wave 2)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let orgId: string;
  let clientId: string;
  let staffToken: string;
  let clientToken: string;
  let slaPolicyId: string;
  let problemId: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    // 1. Setup mock Organization
    const org = await prisma.organization.create({
      data: {
        name: "Wave 2 Org",
      },
    });
    orgId = org.id;

    // 2. Setup mock Client
    const client = await prisma.client.create({
      data: {
        organizationId: orgId,
        name: "Wave 2 Client",
      },
    });
    clientId = client.id;

    // 3. Create users
    const staffUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: "gestor.w2@example.com",
        name: "Gestor W2",
        role: "gestor",
        passwordHash: "hash",
      },
    });

    const clientUser = await prisma.user.create({
      data: {
        organizationId: orgId,
        clientId,
        email: "client.w2@example.com",
        name: "Client W2 User",
        role: "cliente",
        passwordHash: "hash",
      },
    });

    // 4. Create tokens
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

    // 5. Create a SLA Policy
    const slaPolicy = await prisma.slaPolicy.create({
      data: {
        organizationId: orgId,
        clientId,
        name: "W2 SLA Policy",
        responseMinutes: 60,
        resolutionMinutes: 120,
      },
    });
    slaPolicyId = slaPolicy.id;

    // 6. Create a Problem
    const problem = await prisma.problem.create({
      data: {
        organizationId: orgId,
        title: "W2 Database Problem",
        status: "investigating",
      },
    });
    problemId = problem.id;
  });

  afterAll(async () => {
    if (orgId) {
      // Due to cascade deletes, deleting the organization should clean up related objects
      await prisma.organization.delete({
        where: { id: orgId },
      });
    }
    await app.close();
  });

  describe("Articles (Knowledge Base)", () => {
    let articleId: string;

    it("POST /knowledge fails for clients", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/knowledge",
        headers: { authorization: `Bearer ${clientToken}` },
        payload: {
          title: "Client post attempt",
          body: "Should fail",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("POST /knowledge successfully creates article for staff", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/knowledge",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          title: "How to fix DB latency",
          body: "Follow these database optimization steps...",
          visibleToClient: true,
          problemId: problemId,
          status: "published",
        },
      });
      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.article).toBeDefined();
      expect(data.article.title).toBe("How to fix DB latency");
      expect(data.article.problemId).toBe(problemId);
      expect(data.article.visibleToClient).toBe(true);
      expect(data.article.status).toBe("published");
      articleId = data.article.id;
    });

    it("GET /knowledge lets staff see all articles, including draft", async () => {
      // Create a draft article first
      const draftRes = await app.inject({
        method: "POST",
        url: "/knowledge",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          title: "Draft article",
          body: "This is a draft.",
          visibleToClient: false,
          status: "draft",
        },
      });
      expect(draftRes.statusCode).toBe(201);
      const draftId = draftRes.json().article.id;

      const res = await app.inject({
        method: "GET",
        url: "/knowledge",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.articles.length).toBeGreaterThanOrEqual(2);

      // Clean up the draft article
      await app.inject({
        method: "DELETE",
        url: `/knowledge/${draftId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
    });

    it("GET /knowledge lets client see only published & visibleToClient articles", async () => {
      // Create a published but invisible article
      const privateRes = await app.inject({
        method: "POST",
        url: "/knowledge",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          title: "Private Published Article",
          body: "Visible to staff only.",
          visibleToClient: false,
          status: "published",
        },
      });
      expect(privateRes.statusCode).toBe(201);
      const privateId = privateRes.json().article.id;

      const res = await app.inject({
        method: "GET",
        url: "/knowledge",
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();

      // Should find the visible article but not the private one
      const foundPrivate = data.articles.find((a: any) => a.id === privateId);
      expect(foundPrivate).toBeUndefined();

      const foundPublic = data.articles.find((a: any) => a.id === articleId);
      expect(foundPublic).toBeDefined();

      // Clean up private article
      await app.inject({
        method: "DELETE",
        url: `/knowledge/${privateId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
    });

    it("GET /knowledge/:id fetches details", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/knowledge/${articleId}`,
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().article.title).toBe("How to fix DB latency");
    });

    it("PATCH /knowledge/:id updates article data (staff only)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/knowledge/${articleId}`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          title: "Updated DB latency guide",
          visibleToClient: false,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().article.title).toBe("Updated DB latency guide");
      expect(res.json().article.visibleToClient).toBe(false);
    });

    it("GET /portal/knowledge filters articles using ?search=", async () => {
      // Restore visibility to client & publish
      await app.inject({
        method: "PATCH",
        url: `/knowledge/${articleId}`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          visibleToClient: true,
          status: "published",
        },
      });

      // Search with match
      const resMatch = await app.inject({
        method: "GET",
        url: "/portal/knowledge?search=latency",
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(resMatch.statusCode).toBe(200);
      expect(resMatch.json().articles.length).toBe(1);

      // Search with no match
      const resNoMatch = await app.inject({
        method: "GET",
        url: "/portal/knowledge?search=nonexistentterm",
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(resNoMatch.statusCode).toBe(200);
      expect(resNoMatch.json().articles.length).toBe(0);
    });

    it("DELETE /knowledge/:id deletes the article (staff only)", async () => {
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/knowledge/${articleId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: "GET",
        url: `/knowledge/${articleId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe("Service Offerings", () => {
    let offeringId: string;

    it("POST /settings/catalog/offerings creates service offering (staff only)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/settings/catalog/offerings",
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          name: "Premium DB Support",
          description: "Database support with custom SLA",
          slaPolicyId: slaPolicyId,
          requiresApproval: true,
          status: "active",
        },
      });
      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.offering).toBeDefined();
      expect(data.offering.name).toBe("Premium DB Support");
      expect(data.offering.slaPolicyId).toBe(slaPolicyId);
      expect(data.offering.requiresApproval).toBe(true);
      expect(data.offering.status).toBe("active");
      offeringId = data.offering.id;
    });

    it("GET /settings/catalog/offerings lists all offerings (staff only)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/settings/catalog/offerings",
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().offerings.length).toBe(1);
    });

    it("PATCH /settings/catalog/offerings/:id updates offering (staff only)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/settings/catalog/offerings/${offeringId}`,
        headers: { authorization: `Bearer ${staffToken}` },
        payload: {
          name: "Premium DB Support v2",
          requiresApproval: false,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().offering.name).toBe("Premium DB Support v2");
      expect(res.json().offering.requiresApproval).toBe(false);
    });

    it("GET /portal/settings returns active service offerings", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/portal/settings",
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.serviceOfferings).toBeDefined();
      expect(data.serviceOfferings.length).toBe(1);
      expect(data.serviceOfferings[0].name).toBe("Premium DB Support v2");
    });

    it("DELETE /settings/catalog/offerings/:id alters status to 'retired'", async () => {
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/settings/catalog/offerings/${offeringId}`,
        headers: { authorization: `Bearer ${staffToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().offering.status).toBe("retired");

      // Verify it is no longer returned in portal/settings since it is retired (not active)
      const portalRes = await app.inject({
        method: "GET",
        url: "/portal/settings",
        headers: { authorization: `Bearer ${clientToken}` },
      });
      expect(portalRes.statusCode).toBe(200);
      expect(portalRes.json().serviceOfferings.length).toBe(0);
    });
  });
});
