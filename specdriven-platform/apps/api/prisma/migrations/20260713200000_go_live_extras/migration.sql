-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "logoStorageKey" TEXT;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "visibleToClient" BOOLEAN NOT NULL DEFAULT false;
