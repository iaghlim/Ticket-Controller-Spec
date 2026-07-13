-- CreateTable
CREATE TABLE "organization_settings" (
    "organizationId" TEXT NOT NULL,
    "supportEmail" TEXT,
    "supportPolicyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("organizationId")
);

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed settings row for existing organizations
INSERT INTO "organization_settings" ("organizationId", "updatedAt")
SELECT "id", CURRENT_TIMESTAMP FROM "organizations"
ON CONFLICT ("organizationId") DO NOTHING;
