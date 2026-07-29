import { Worker, type Job } from "bullmq";
import { getRedisConnection, type MailJobData } from "../queue/index.js";
import { sendMail, sendPasswordResetEmail, sendInviteEmail } from "../mail.js";

export function initMailWorker(): Worker<MailJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  try {
    const worker = new Worker<MailJobData>(
      "mail-queue",
      async (job: Job<MailJobData>) => {
        const { data } = job;
        if (data.type === "password_reset" && data.resetUrl) {
          await sendPasswordResetEmail({
            to: data.to,
            name: data.name,
            resetUrl: data.resetUrl,
            organizationId: data.organizationId ?? "",
          });
        } else if (data.type === "invite" && data.inviteUrl) {
          await sendInviteEmail({
            to: data.to,
            role: data.name,
            token: data.inviteUrl,
            expiresAt: new Date(Date.now() + 86400000),
            organizationId: data.organizationId,
          });
        } else {
          await sendMail({
            to: data.to,
            subject: data.subject ?? "Notificação SpecDriven",
            text: data.bodyHtml ?? "",
            html: data.bodyHtml,
            organizationId: data.organizationId,
          });
        }
      },
      { connection: conn, concurrency: 5 },
    );

    worker.on("completed", (job) => {
      console.info(`[mailWorker] Job ${job.id} completed for ${job.data.to}`);
    });

    worker.on("failed", (job, err) => {
      console.warn(`[mailWorker] Job ${job?.id} failed: ${err.message}`);
    });

    return worker;
  } catch {
    return null;
  }
}
