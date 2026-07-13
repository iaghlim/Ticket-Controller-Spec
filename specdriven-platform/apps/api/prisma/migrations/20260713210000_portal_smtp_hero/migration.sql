-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "portalHeroTitle" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "portalHeroSubtitle" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "smtpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "smtpHost" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "smtpUser" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "smtpPass" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "smtpFrom" TEXT;
