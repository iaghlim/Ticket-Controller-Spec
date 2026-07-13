-- Sprint 4: advanced SLA settings (holidays, business hours template, target %)

ALTER TABLE "organization_settings"
  ADD COLUMN "slaTargetPct" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "defaultBusinessHoursJson" TEXT;

CREATE TABLE "organization_holidays" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "organization_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_holidays_organizationId_date_key"
  ON "organization_holidays"("organizationId", "date");

CREATE INDEX "organization_holidays_organizationId_idx"
  ON "organization_holidays"("organizationId");

ALTER TABLE "organization_holidays"
  ADD CONSTRAINT "organization_holidays_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
