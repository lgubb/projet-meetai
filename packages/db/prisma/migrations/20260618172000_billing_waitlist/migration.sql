-- CreateTable
CREATE TABLE "BillingWaitlistEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingWaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingWaitlistEntry_organizationId_email_key" ON "BillingWaitlistEntry"("organizationId", "email");

-- CreateIndex
CREATE INDEX "BillingWaitlistEntry_createdByUserId_idx" ON "BillingWaitlistEntry"("createdByUserId");

-- AddForeignKey
ALTER TABLE "BillingWaitlistEntry" ADD CONSTRAINT "BillingWaitlistEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingWaitlistEntry" ADD CONSTRAINT "BillingWaitlistEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
