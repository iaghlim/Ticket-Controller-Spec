/**
 * Bootstrap mínimo — org master + usuário master, sem dados demo.
 * Uso após migrate em banco limpo:
 *   npm run db:bootstrap
 *
 * Variáveis opcionais (.env):
 *   MASTER_EMAIL, MASTER_PASSWORD, MASTER_NAME, ORG_NAME
 */
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const orgName = process.env.ORG_NAME?.trim() || "Blend IT";
  const masterEmail =
    process.env.MASTER_EMAIL?.trim() || "master@blendit.local";
  const masterName = process.env.MASTER_NAME?.trim() || "Master";
  const plainPassword =
    process.env.MASTER_PASSWORD?.trim() ||
    randomBytes(12).toString("base64url");

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.error(
      "Banco já tem usuários. Rode reset-local antes ou apague os dados manualmente.",
    );
    process.exit(1);
  }

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      isMasterConsultancy: true,
    },
  });

  await prisma.organizationSettings.create({
    data: { organizationId: org.id },
  });

  await prisma.ticketModuleCatalog.create({
    data: {
      organizationId: org.id,
      key: "geral",
      label: "Geral",
      sortOrder: 0,
      enabled: true,
    },
  });

  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: masterEmail,
      name: masterName,
      passwordHash,
      role: "master",
      clientId: null,
    },
  });

  console.log("");
  console.log("Bootstrap concluído — banco limpo, sem dados demo.");
  console.log("");
  console.log("  Organização:", org.name, `(id: ${org.id})`);
  console.log("  Portal staff: http://localhost:5174/login");
  console.log("");
  console.log("  E-mail:", user.email);
  console.log("  Senha: ", plainPassword);
  console.log("");
  console.log("Guarde a senha. Altere em Configurações após o primeiro login.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
