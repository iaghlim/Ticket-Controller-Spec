-- AlterEnum: add master and admin roles
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'master';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'admin';

-- AlterTable: master consultancy flag
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "isMasterConsultancy" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: projects per client
CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "projects_organizationId_idx" ON "projects"("organizationId");
CREATE INDEX IF NOT EXISTS "projects_clientId_idx" ON "projects"("clientId");

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_organizationId_fkey";
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_clientId_fkey";
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
