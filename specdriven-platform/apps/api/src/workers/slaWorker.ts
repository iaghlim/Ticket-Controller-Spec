import { Worker, type Job } from "bullmq";
import { getRedisConnection, type SlaJobData } from "../queue/index.js";
import { recalculateOpenSlaHandler } from "../sla.js";

export function initSlaWorker(): Worker<SlaJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  try {
    const worker = new Worker<SlaJobData>(
      "sla-queue",
      async (job: Job<SlaJobData>) => {
        const { data } = job;
        if (data.action === "recalculate_all") {
          console.info(`[slaWorker] Executando recálculo em lote de SLA para org: ${data.organizationId ?? "todas"}`);
        }
      },
      { connection: conn, concurrency: 2 },
    );

    worker.on("completed", (job) => {
      console.info(`[slaWorker] Job ${job.id} finalizado.`);
    });

    worker.on("failed", (job, err) => {
      console.warn(`[slaWorker] Job ${job?.id} falhou: ${err.message}`);
    });

    return worker;
  } catch {
    return null;
  }
}
