CREATE TABLE "ProviderExchangeRate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceCurrency" TEXT NOT NULL,
  "reportingCurrency" TEXT NOT NULL,
  "rateBps" INTEGER NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "sourceUrl" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderExchangeRate_organizationId_sourceCurrency_reportingCurrency_effectiveAt_idx"
  ON "ProviderExchangeRate"("organizationId", "sourceCurrency", "reportingCurrency", "effectiveAt");

ALTER TABLE "ProviderExchangeRate"
  ADD CONSTRAINT "ProviderExchangeRate_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
