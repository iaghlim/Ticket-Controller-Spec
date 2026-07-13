/**
 * Object storage via S3-compatible API (MinIO locally).
 * When S3_ENDPOINT is unset, binary upload is disabled (metadata-only stub).
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

let client: S3Client | null = null;
let ensuredBucket = false;

export function isStorageConfigured(): boolean {
  return Boolean(process.env.S3_ENDPOINT?.trim());
}

export function getStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!endpoint) return null;
  return {
    endpoint,
    region: process.env.S3_REGION?.trim() || "us-east-1",
    bucket: process.env.S3_BUCKET?.trim() || "specdriven",
    accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() || "minioadmin",
    secretAccessKey:
      process.env.S3_SECRET_ACCESS_KEY?.trim() || "minioadmin",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

function getClient(): S3Client {
  const cfg = getStorageConfig();
  if (!cfg) {
    throw new Error("storage_not_configured");
  }
  if (!client) {
    client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  if (!isStorageConfigured() || ensuredBucket) return;
  const cfg = getStorageConfig();
  if (!cfg) return;
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
    } catch (err) {
      // Race / already exists
      const msg = String(err);
      if (!msg.includes("BucketAlreadyOwnedByYou") && !msg.includes("BucketAlreadyExists")) {
        console.warn("[storage] ensureBucket failed:", err);
        return;
      }
    }
  }
  ensuredBucket = true;
}

export async function putObject(opts: {
  key: string;
  body: Buffer;
  contentType?: string | null;
}): Promise<{ storageKey: string; bucket: string }> {
  const cfg = getStorageConfig();
  if (!cfg) throw new Error("storage_not_configured");
  await ensureBucket();
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType ?? "application/octet-stream",
    }),
  );
  return { storageKey: `s3://${cfg.bucket}/${opts.key}`, bucket: cfg.bucket };
}

export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const cfg = getStorageConfig();
  if (!cfg) return null;
  const prefix = `s3://${cfg.bucket}/`;
  if (!storageKey.startsWith(prefix)) return null;
  const key = storageKey.slice(prefix.length);
  const s3 = getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export function objectKeyForAttachment(
  ticketId: string,
  attachmentId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `attachments/${ticketId}/${attachmentId}/${safe}`;
}
