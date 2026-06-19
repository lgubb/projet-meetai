-- CreateTable
CREATE TABLE "ProviderCostEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCostEntry_organizationId_periodStart_idx" ON "ProviderCostEntry"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "ProviderCostEntry_createdByUserId_idx" ON "ProviderCostEntry"("createdByUserId");

-- AddForeignKey
ALTER TABLE "ProviderCostEntry" ADD CONSTRAINT "ProviderCostEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCostEntry" ADD CONSTRAINT "ProviderCostEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
