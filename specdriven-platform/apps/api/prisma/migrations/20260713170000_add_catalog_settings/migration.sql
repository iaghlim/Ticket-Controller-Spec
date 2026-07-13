-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "enabledTicketTypes" TEXT NOT NULL DEFAULT 'melhoria,incidente,duvida,problema';

-- CreateTable
CREATE TABLE "ticket_module_catalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_module_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_module_catalog_organizationId_key_key" ON "ticket_module_catalog"("organizationId", "key");

-- CreateIndex
CREATE INDEX "ticket_module_catalog_organizationId_idx" ON "ticket_module_catalog"("organizationId");

-- AddForeignKey
ALTER TABLE "ticket_module_catalog" ADD CONSTRAINT "ticket_module_catalog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default module for existing organizations
INSERT INTO "ticket_module_catalog" ("id", "organizationId", "key", "label", "sortOrder", "enabled", "updatedAt")
SELECT
    gen_random_uuid()::text,
    o."id",
    'geral',
    'Geral',
    0,
    true,
    CURRENT_TIMESTAMP
FROM "organizations" o
WHERE NOT EXISTS (
    SELECT 1 FROM "ticket_module_catalog" m
    WHERE m."organizationId" = o."id" AND m."key" = 'geral'
);
