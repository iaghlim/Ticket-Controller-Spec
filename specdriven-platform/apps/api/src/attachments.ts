import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { TicketKeySchema } from "@specdriven/shared";
import { requireAuth, type AuthUser } from "./auth.js";
import { isDbUnavailableError, prisma } from "./db.js";
import {
  getPresignedDownloadUrl,
  isStorageConfigured,
  objectKeyForAttachment,
  putObject,
} from "./storage.js";

/**
 * Metadata JSON body (always available).
 * Multipart binary upload when MinIO/S3 is configured (field `file`).
 */
const CreateAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().optional().nullable(),
  sizeBytes: z.number().int().nonnegative().optional().nullable(),
});

function dbUnavailable(reply: FastifyReply) {
  return reply.status(503).send({
    error: "database_unavailable",
    message:
      "Postgres indisponível. Suba o Docker (`docker compose up -d`) e rode `npm run db:push`.",
  });
}

async function findTicketForUser(user: AuthUser, key: string) {
  return prisma.ticket.findFirst({
    where: {
      key,
      organizationId:
        user.organizationId === "dev-org" ? undefined : user.organizationId,
      ...(user.role === "cliente" && user.clientId
        ? { clientId: user.clientId }
        : {}),
    },
  });
}

export async function listAttachmentsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await findTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }

    const attachments = await prisma.attachment.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { attachments, storageConfigured: isStorageConfigured() };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function createAttachmentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (user.organizationId === "dev-org") {
    return reply.status(503).send({
      error: "database_required",
      message:
        "Anexos exigem Postgres + login real (DEV_AUTH_BYPASS=false).",
    });
  }

  const params = z.object({ key: TicketKeySchema }).safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_key" });
  }

  try {
    const ticket = await findTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }

    const isMultipart = request.isMultipart?.() === true;

    if (isMultipart) {
      if (!isStorageConfigured()) {
        return reply.status(503).send({
          error: "storage_not_configured",
          message:
            "Upload binário exige MinIO/S3. Defina S3_ENDPOINT (veja docker-compose minio).",
        });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "file_required" });
      }

      const buffer = await file.toBuffer();
      const fileName = file.filename || "upload.bin";
      const mimeType = file.mimetype || null;
      const id = randomUUID();
      const objectKey = objectKeyForAttachment(ticket.id, id, fileName);
      const uploaded = await putObject({
        key: objectKey,
        body: buffer,
        contentType: mimeType,
      });

      const attachment = await prisma.attachment.create({
        data: {
          id,
          ticketId: ticket.id,
          storageKey: uploaded.storageKey,
          fileName,
          mimeType,
          sizeBytes: buffer.length,
        },
      });

      return reply.status(201).send({
        attachment,
        mode: "s3" as const,
      });
    }

    const parsed = CreateAttachmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid_body",
        details: parsed.error.flatten(),
      });
    }

    const id = randomUUID();
    const storageKey = `local://attachments/${id}/${parsed.data.fileName}`;
    const attachment = await prisma.attachment.create({
      data: {
        id,
        ticketId: ticket.id,
        storageKey,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType ?? null,
        sizeBytes: parsed.data.sizeBytes ?? null,
      },
    });
    return reply.status(201).send({
      attachment,
      mode: "metadata_only" as const,
      note: isStorageConfigured()
        ? "Envie multipart field `file` para upload binário no MinIO/S3."
        : "Upload binário (S3/MinIO) não configurado — só metadados.",
    });
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}

export async function getAttachmentDownloadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  const params = z
    .object({
      key: TicketKeySchema,
      id: z.string().uuid(),
    })
    .safeParse(request.params);
  if (!params.success) {
    return reply.status(400).send({ error: "invalid_params" });
  }

  try {
    const ticket = await findTicketForUser(user, params.data.key);
    if (!ticket) {
      return reply.status(404).send({ error: "ticket_not_found" });
    }

    const attachment = await prisma.attachment.findFirst({
      where: { id: params.data.id, ticketId: ticket.id },
    });
    if (!attachment) {
      return reply.status(404).send({ error: "attachment_not_found" });
    }

    if (attachment.storageKey.startsWith("local://")) {
      return reply.status(501).send({
        error: "metadata_only",
        message: "Anexo sem objeto no storage (criado só com metadados).",
      });
    }

    const url = await getPresignedDownloadUrl(attachment.storageKey);
    if (!url) {
      return reply.status(503).send({ error: "storage_not_configured" });
    }

    return { url, attachmentId: attachment.id, expiresInSeconds: 3600 };
  } catch (err) {
    if (isDbUnavailableError(err)) return dbUnavailable(reply);
    throw err;
  }
}
