import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db.js";
import { createNotification } from "./notifications.js";
import { requireAuth } from "./auth.js";
import { isStaff } from "./permissions.js";

export async function checkSlaWarnings(): Promise<void> {
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        status: {
          notIn: ["concluido", "cancelado"],
        },
        slaDueAt: {
          gt: now,
          lte: twoHoursLater,
        },
      },
    });

    for (const ticket of tickets) {
      // Find all gestores of this organization
      const gestores = await prisma.user.findMany({
        where: {
          organizationId: ticket.organizationId,
          role: "gestor",
        },
        select: { id: true },
      });

      const userIdsToNotify = new Set<string>();
      if (ticket.assigneeId) {
        userIdsToNotify.add(ticket.assigneeId);
      }
      for (const g of gestores) {
        userIdsToNotify.add(g.id);
      }

      const title = `Aviso de SLA: Chamado ${ticket.key} vence em breve`;
      const body = `O chamado "${ticket.title}" está a menos de 2 horas do vencimento do SLA.`;
      const href = `/tickets/${ticket.id}`;

      for (const userId of userIdsToNotify) {
        // Avoid duplicate in-app notification
        const existing = await prisma.notification.findFirst({
          where: {
            organizationId: ticket.organizationId,
            userId,
            href,
            title,
          },
        });

        if (!existing) {
          await createNotification({
            organizationId: ticket.organizationId,
            userId,
            title,
            body,
            href,
          });
        }
      }
    }
  } catch (error) {
    console.error("Erro na rotina de verificação de SLA:", error);
  }
}

export async function checkSlaWarningsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = await requireAuth(request, reply);
  if (!user) return;

  if (!isStaff(user)) {
    return reply.status(403).send({ error: "forbidden_staff_only" });
  }

  await checkSlaWarnings();
  return { success: true };
}
