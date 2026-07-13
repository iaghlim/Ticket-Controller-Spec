/**
 * Local seed only — credentials are intentional demo defaults, not production secrets.
 *
 * Usage (with Docker Postgres up):
 *   npm run db:push
 *   npm run db:seed -w @specdriven/api
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { name: "Blend IT", isMasterConsultancy: true },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Blend IT",
      isMasterConsultancy: true,
    },
  });

  const client = await prisma.client.upsert({
    where: { id: "00000000-0000-4000-8000-000000000002" },
    update: { name: "Cliente Demo", code: "DEMO" },
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      organizationId: org.id,
      name: "Cliente Demo",
      code: "DEMO",
    },
  });

  const passwordHash = await bcrypt.hash("changeme", 10);

  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: "master@blendit.local",
      },
    },
    update: {
      name: "Master Blend IT",
      passwordHash,
      role: "master",
      clientId: null,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000020",
      organizationId: org.id,
      email: "master@blendit.local",
      name: "Master Blend IT",
      passwordHash,
      role: "master",
      clientId: null,
    },
  });

  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: "admin@blendit.local",
      },
    },
    update: {
      name: "Admin Blend IT",
      passwordHash,
      role: "admin",
      clientId: null,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000021",
      organizationId: org.id,
      email: "admin@blendit.local",
      name: "Admin Blend IT",
      passwordHash,
      role: "admin",
      clientId: null,
    },
  });

  const gestor = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: "gestor@specdriven.local",
      },
    },
    update: {
      name: "Gestor Demo",
      passwordHash,
      role: "gestor",
      clientId: null,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000003",
      organizationId: org.id,
      email: "gestor@specdriven.local",
      name: "Gestor Demo",
      passwordHash,
      role: "gestor",
      clientId: null,
    },
  });

  await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: "cliente@specdriven.local",
      },
    },
    update: {
      name: "Cliente Demo User",
      passwordHash,
      role: "cliente",
      clientId: client.id,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000004",
      organizationId: org.id,
      email: "cliente@specdriven.local",
      name: "Cliente Demo User",
      passwordHash,
      role: "cliente",
      clientId: client.id,
    },
  });

  const consultor = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: "consultor@specdriven.local",
      },
    },
    update: {
      name: "Consultor Demo",
      passwordHash,
      role: "consultor",
      clientId: null,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000005",
      organizationId: org.id,
      email: "consultor@specdriven.local",
      name: "Consultor Demo",
      passwordHash,
      role: "consultor",
      clientId: null,
    },
  });

  await prisma.ticket.upsert({
    where: {
      organizationId_key: {
        organizationId: org.id,
        key: "DEMO-1",
      },
    },
    update: {
      title: "Chamado demo inicial",
      status: "backlog",
      clientId: client.id,
      assigneeId: gestor.id,
      hourLimitMinutes: 60,
    },
    create: {
      organizationId: org.id,
      clientId: client.id,
      key: "DEMO-1",
      title: "Chamado demo inicial",
      description: "Ticket de seed para smoke tests da API.",
      status: "backlog",
      assigneeId: gestor.id,
      hourLimitMinutes: 60,
    },
  });

  const tagUrgente = await prisma.tag.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: "urgente",
      },
    },
    update: { color: "#c0392b" },
    create: {
      id: "00000000-0000-4000-8000-000000000010",
      organizationId: org.id,
      name: "urgente",
      color: "#c0392b",
    },
  });

  await prisma.tag.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: "infra",
      },
    },
    update: { color: "#2980b9" },
    create: {
      id: "00000000-0000-4000-8000-000000000011",
      organizationId: org.id,
      name: "infra",
      color: "#2980b9",
    },
  });

  const demoTicket = await prisma.ticket.findUnique({
    where: {
      organizationId_key: { organizationId: org.id, key: "DEMO-1" },
    },
  });

  if (demoTicket) {
    await prisma.ticketTag.upsert({
      where: {
        ticketId_tagId: {
          ticketId: demoTicket.id,
          tagId: tagUrgente.id,
        },
      },
      update: {},
      create: { ticketId: demoTicket.id, tagId: tagUrgente.id },
    });

    const histCount = await prisma.ticketStatusHistory.count({
      where: { ticketId: demoTicket.id },
    });
    if (histCount === 0) {
      await prisma.ticketStatusHistory.create({
        data: {
          ticketId: demoTicket.id,
          fromStatus: null,
          toStatus: "backlog",
          changedById: gestor.id,
          note: "seed",
        },
      });
    }

    await prisma.slaPolicy.upsert({
      where: {
        clientId_priorityMatch: {
          clientId: client.id,
          priorityMatch: "",
        },
      },
      update: {
        name: "SLA padrão Demo",
        responseMinutes: 240,
        resolutionMinutes: 960,
        businessHourStart: 9,
        businessHourEnd: 18,
        weekdays: "1,2,3,4,5",
      },
      create: {
        id: "00000000-0000-4000-8000-000000000012",
        organizationId: org.id,
        clientId: client.id,
        name: "SLA padrão Demo",
        priorityMatch: "",
        responseMinutes: 240,
        resolutionMinutes: 960,
        businessHourStart: 9,
        businessHourEnd: 18,
        weekdays: "1,2,3,4,5",
      },
    });

    // Recalcula prazo SLA do seed se vazio
    if (!demoTicket.slaDueAt) {
      const { addBusinessMinutes, businessHoursFromPolicy } = await import(
        "../src/sla-calc.js"
      );
      const policy = await prisma.slaPolicy.findFirst({
        where: { clientId: client.id, priorityMatch: "" },
      });
      if (policy) {
        const due = addBusinessMinutes(
          demoTicket.createdAt,
          policy.resolutionMinutes,
          businessHoursFromPolicy(policy),
        );
        await prisma.ticket.update({
          where: { id: demoTicket.id },
          data: { slaDueAt: due },
        });
      }
    }

    const pendingTicket = await prisma.approvalRequest.findFirst({
      where: {
        organizationId: org.id,
        ticketId: demoTicket.id,
        kind: "ticket",
        status: "pending",
      },
    });
    if (!pendingTicket) {
      await prisma.approvalRequest.create({
        data: {
          organizationId: org.id,
          kind: "ticket",
          ticketId: demoTicket.id,
          requesterId: consultor.id,
          targetStatus: "concluido",
          reason: "Seed: solicitar fechamento do chamado demo",
        },
      });
    }

    const pendingHour = await prisma.approvalRequest.findFirst({
      where: {
        organizationId: org.id,
        ticketId: demoTicket.id,
        kind: "hour_limit",
        status: "pending",
      },
    });
    if (!pendingHour) {
      await prisma.approvalRequest.create({
        data: {
          organizationId: org.id,
          kind: "hour_limit",
          ticketId: demoTicket.id,
          requesterId: consultor.id,
          requestedMinutes: 120,
          reason: "Seed: pedir aumento do limite 60 → 120 min",
        },
      });
    }
  }

  console.log("Seed OK");
  console.log("  org:", org.name, org.isMasterConsultancy ? "(master consultancy)" : "");
  console.log("  client:", client.name);
  console.log("  user: master@blendit.local / changeme (local only)");
  console.log("  user: admin@blendit.local / changeme (local only)");
  console.log("  user: gestor@specdriven.local / changeme (local only)");
  console.log("  user: consultor@specdriven.local / changeme (local only)");
  console.log("  user: cliente@specdriven.local / changeme (local only)");
  console.log("  ticket: DEMO-1 (hourLimit=60; approvals pending ticket+hour_limit)");
  console.log("  tags: urgente, infra | SLA policy default | status history seed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
