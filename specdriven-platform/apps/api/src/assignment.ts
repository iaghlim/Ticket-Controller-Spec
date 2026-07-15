import { prisma } from "./db.js";

interface AutoAssignInput {
  projectId: string;
  module: string | null;
}

export async function autoAssign(ticket: AutoAssignInput): Promise<string | null> {
  if (!ticket.module) {
    return null;
  }

  // Find assignments in N1 pool for this project and module
  const assignments = await prisma.projectModuleAssignment.findMany({
    where: {
      projectId: ticket.projectId,
      module: ticket.module,
      tier: "N1",
    },
  });

  if (assignments.length === 0) {
    return null;
  }

  // For each user assigned, count their open tickets in this project
  const userTicketsCount = await Promise.all(
    assignments.map(async (assign) => {
      const openCount = await prisma.ticket.count({
        where: {
          projectId: ticket.projectId,
          assigneeId: assign.userId,
          status: {
            notIn: ["concluido", "cancelado"],
          },
        },
      });
      return { userId: assign.userId, count: openCount };
    })
  );

  // Find the user with the minimum number of open tickets
  userTicketsCount.sort((a, b) => a.count - b.count);
  return userTicketsCount[0].userId;
}
