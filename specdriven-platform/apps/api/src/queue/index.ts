import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const IS_REDIS_DISABLED = process.env.DISABLE_REDIS === "true" || process.env.NODE_ENV === "test";

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis | null {
  if (IS_REDIS_DISABLED) return null;
  if (!redisConnection) {
    try {
      redisConnection = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      });
      redisConnection.on("error", () => {
        // Suppress unhandled redis connection error noise in dev/test
      });
    } catch {
      redisConnection = null;
    }
  }
  return redisConnection;
}

export type MailJobData = {
  to: string;
  name: string;
  resetUrl?: string;
  inviteUrl?: string;
  organizationId?: string;
  subject?: string;
  bodyHtml?: string;
  type: "password_reset" | "invite" | "custom";
};

export type SlaJobData = {
  organizationId?: string;
  ticketId?: string;
  action: "recalculate_all" | "check_violations";
};

let mailQueue: Queue<MailJobData> | null = null;
let slaQueue: Queue<SlaJobData> | null = null;

const conn = getRedisConnection();
if (conn) {
  try {
    mailQueue = new Queue<MailJobData>("mail-queue", { connection: conn });
    slaQueue = new Queue<SlaJobData>("sla-queue", { connection: conn });
  } catch {
    mailQueue = null;
    slaQueue = null;
  }
}

export async function enqueueMailJob(data: MailJobData): Promise<boolean> {
  if (mailQueue) {
    try {
      await mailQueue.add("send_email", data, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      });
      return true;
    } catch {
      // Fallback if Redis queue fails
    }
  }
  return false;
}

export async function enqueueSlaJob(data: SlaJobData): Promise<boolean> {
  if (slaQueue) {
    try {
      await slaQueue.add("process_sla", data, {
        attempts: 2,
        backoff: { type: "fixed", delay: 5000 },
      });
      return true;
    } catch {
      // Fallback if Redis queue fails
    }
  }
  return false;
}
