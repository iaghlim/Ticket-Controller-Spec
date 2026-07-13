import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { TICKET_STATUSES, TICKET_TYPES, TICKET_MODULES, USER_ROLES } from "@specdriven/shared";
import {
  approveApprovalHandler,
  createApprovalHandler,
  listApprovalsHandler,
  patchTicketHourLimitHandler,
  rejectApprovalHandler,
} from "./approvals.js";
import { listAuditHandler } from "./audit.js";
import { loginHandler, meHandler } from "./auth.js";
import {
  createAttachmentHandler,
  getAttachmentDownloadHandler,
  listAttachmentsHandler,
} from "./attachments.js";
import {
  billingSummaryHandler,
  patchClientBillingHandler,
  patchUserBillingHandler,
} from "./billing.js";
import {
  createClientHandler,
  listClientsHandler,
} from "./clients.js";
import {
  createCommentHandler,
  listCommentsHandler,
} from "./comments.js";
import {
  assertJwtSecretForProduction,
  registerHardening,
} from "./hardening.js";
import {
  acceptInviteHandler,
  createInviteHandler,
  listInvitesHandler,
} from "./invites.js";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "./notifications.js";
import { registerOpenApi } from "./openapi.js";
import {
  privacyDeleteHandler,
  privacyExportHandler,
  restoreTicketHandler,
  softDeleteTicketHandler,
} from "./privacy.js";
import { ticketsReportHandler } from "./reports.js";
import { searchHandler } from "./search.js";
import {
  createSlaPolicyHandler,
  deleteSlaPolicyHandler,
  getTicketSlaHandler,
  listSlaPoliciesHandler,
  patchSlaPolicyHandler,
} from "./sla.js";
import { ensureBucket, isStorageConfigured } from "./storage.js";
import { syncPullHandler, syncPushHandler } from "./sync.js";
import {
  addTicketTagHandler,
  createTagHandler,
  deleteTagHandler,
  listTagsHandler,
  listTicketTagsHandler,
  patchTagHandler,
  putTicketTagsHandler,
  removeTicketTagHandler,
} from "./tags.js";
import { listTicketStatusHistoryHandler } from "./ticket-history.js";
import {
  createTicketTimeEntryHandler,
  listTicketTimeEntriesHandler,
  listTimeEntriesRangeHandler,
} from "./time-entries.js";
import {
  createTicketHandler,
  getTicketByKeyHandler,
  listTicketsHandler,
  patchTicketHandler,
} from "./tickets.js";
import { listUsersHandler } from "./users.js";
import {
  createOrganizationHandler,
  createOrgUserHandler,
  listOrganizationsHandler,
} from "./organizations.js";
import {
  createProjectHandler,
  listProjectsHandler,
} from "./projects.js";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });
dotenv.config();

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function buildServer() {
  assertJwtSecretForProduction();

  const app = Fastify({
    logger: true,
  });

  await registerHardening(app);
  await registerOpenApi(app);

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: Number(process.env.UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024),
      files: 1,
    },
  });

  app.get("/health", async () => {
    return { status: "ok" as const };
  });

  const helloPayload = {
    message: "Hello from SpecDriven API",
    product: "SpecDriven Platform",
    version: "0.1.0",
  };

  app.get("/", async () => helloPayload);
  app.get("/hello", async () => helloPayload);

  app.post("/auth/login", loginHandler);
  app.get("/auth/me", meHandler);

  app.get("/clients", listClientsHandler);
  app.post("/clients", createClientHandler);
  app.patch("/clients/:id/billing", patchClientBillingHandler);

  app.get("/invites", listInvitesHandler);
  app.post("/invites", createInviteHandler);
  app.post("/invites/accept", acceptInviteHandler);

  app.get("/tickets", listTicketsHandler);
  app.post("/tickets", createTicketHandler);
  app.get("/tickets/:key", getTicketByKeyHandler);
  app.patch("/tickets/:key", patchTicketHandler);
  app.delete("/tickets/:key", softDeleteTicketHandler);
  app.post("/tickets/:key/restore", restoreTicketHandler);

  app.get("/tickets/:key/comments", listCommentsHandler);
  app.post("/tickets/:key/comments", createCommentHandler);

  app.get("/tickets/:key/attachments", listAttachmentsHandler);
  app.post("/tickets/:key/attachments", createAttachmentHandler);
  app.get(
    "/tickets/:key/attachments/:id/download",
    getAttachmentDownloadHandler,
  );

  app.get("/tickets/:key/time-entries", listTicketTimeEntriesHandler);
  app.post("/tickets/:key/time-entries", createTicketTimeEntryHandler);
  app.get("/time-entries", listTimeEntriesRangeHandler);

  app.get("/approvals", listApprovalsHandler);
  app.post("/approvals", createApprovalHandler);
  app.post("/approvals/:id/approve", approveApprovalHandler);
  app.post("/approvals/:id/reject", rejectApprovalHandler);
  app.patch("/tickets/:key/hour-limit", patchTicketHourLimitHandler);

  app.get("/tickets/:key/status-history", listTicketStatusHistoryHandler);
  app.get("/tickets/:key/sla", getTicketSlaHandler);
  app.get("/tickets/:key/tags", listTicketTagsHandler);
  app.put("/tickets/:key/tags", putTicketTagsHandler);
  app.post("/tickets/:key/tags", addTicketTagHandler);
  app.delete("/tickets/:key/tags/:tagId", removeTicketTagHandler);

  app.get("/tags", listTagsHandler);
  app.post("/tags", createTagHandler);
  app.patch("/tags/:id", patchTagHandler);
  app.delete("/tags/:id", deleteTagHandler);

  app.get("/sla-policies", listSlaPoliciesHandler);
  app.post("/sla-policies", createSlaPolicyHandler);
  app.patch("/sla-policies/:id", patchSlaPolicyHandler);
  app.delete("/sla-policies/:id", deleteSlaPolicyHandler);

  app.get("/sync/pull", syncPullHandler);
  app.post("/sync/push", syncPushHandler);

  app.get("/search", searchHandler);

  app.get("/notifications", listNotificationsHandler);
  app.post("/notifications/:id/read", markNotificationReadHandler);
  app.post("/notifications/read-all", markAllNotificationsReadHandler);

  app.get("/billing/summary", billingSummaryHandler);
  app.patch("/users/:id/billing", patchUserBillingHandler);

  app.get("/privacy/export", privacyExportHandler);
  app.post("/privacy/delete", privacyDeleteHandler);

  app.get("/audit", listAuditHandler);

  app.get("/reports/tickets", ticketsReportHandler);

  app.get("/users", listUsersHandler);

  app.get("/organizations", listOrganizationsHandler);
  app.post("/organizations", createOrganizationHandler);
  app.post("/organizations/:organizationId/users", createOrgUserHandler);

  app.get("/projects", listProjectsHandler);
  app.post("/projects", createProjectHandler);

  app.get("/_meta/routes", async () => {
    return {
      implemented: [
        "GET /health",
        "GET /docs",
        "POST /auth/login",
        "GET /auth/me",
        "GET|POST /clients",
        "PATCH /clients/:id/billing",
        "GET|POST /invites",
        "POST /invites/accept",
        "GET /users",
        "GET|POST /organizations",
        "POST /organizations/:organizationId/users",
        "GET|POST /projects",
        "PATCH /users/:id/billing",
        "GET|POST /tickets",
        "GET|PATCH|DELETE /tickets/:key",
        "POST /tickets/:key/restore",
        "GET|POST /tickets/:key/comments",
        "GET|POST /tickets/:key/attachments",
        "GET /tickets/:key/attachments/:id/download",
        "GET|POST /tickets/:key/time-entries",
        "GET /time-entries",
        "GET|POST /approvals",
        "POST /approvals/:id/approve",
        "POST /approvals/:id/reject",
        "PATCH /tickets/:key/hour-limit",
        "GET /tickets/:key/status-history",
        "GET /tickets/:key/sla",
        "GET|PUT|POST /tickets/:key/tags",
        "DELETE /tickets/:key/tags/:tagId",
        "GET|POST|PATCH|DELETE /tags",
        "GET|POST|PATCH|DELETE /sla-policies",
        "GET /sync/pull",
        "POST /sync/push",
        "GET /search",
        "GET /notifications",
        "POST /notifications/:id/read",
        "POST /notifications/read-all",
        "GET /billing/summary",
        "GET /privacy/export",
        "POST /privacy/delete",
        "GET /audit",
        "GET /reports/tickets",
        "GET /_meta/routes",
      ],
      planned: [
        "SMTP real (workstream dedicado)",
        "Users picker UI (workstream dedicado)",
      ],
      domain: {
        roles: USER_ROLES,
        ticketStatuses: TICKET_STATUSES,
        ticketTypes: TICKET_TYPES,
        ticketModules: TICKET_MODULES,
      },
      flags: {
        DEV_AUTH_BYPASS: process.env.DEV_AUTH_BYPASS === "true",
        storageConfigured: isStorageConfigured(),
        mailProvider: process.env.MAIL_PROVIDER ?? "log",
      },
      docs: "/docs",
    };
  });

  return app;
}

async function main() {
  const app = await buildServer();

  if (isStorageConfigured()) {
    try {
      await ensureBucket();
      app.log.info("S3/MinIO bucket ready");
    } catch (err) {
      app.log.warn({ err }, "S3/MinIO ensureBucket failed (API sobe sem storage)");
    }
  }

  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
