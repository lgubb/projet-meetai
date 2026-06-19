CREATE TABLE "OrganizationPolicyRuleOverride" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "riskLevel" "TaskRiskLevel" NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrganizationPolicyRuleOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationPolicyRuleOverride_organizationId_ruleId_key"
  ON "OrganizationPolicyRuleOverride"("organizationId", "ruleId");

CREATE INDEX "OrganizationPolicyRuleOverride_organizationId_idx"
  ON "OrganizationPolicyRuleOverride"("organizationId");

CREATE INDEX "OrganizationPolicyRuleOverride_updatedByUserId_idx"
  ON "OrganizationPolicyRuleOverride"("updatedByUserId");

ALTER TABLE "OrganizationPolicyRuleOverride"
  ADD CONSTRAINT "OrganizationPolicyRuleOverride_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationPolicyRuleOverride"
  ADD CONSTRAINT "OrganizationPolicyRuleOverride_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
