-- CreateEnum
CREATE TYPE "LocalAgentPairingStatus" AS ENUM ('PENDING', 'CONSUMED', 'CODEX_AUTH_ERROR', 'BRIDGE_ERROR', 'EXPIRED');

-- CreateTable
CREATE TABLE "LocalAgentPairingCode" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "codeHash" TEXT NOT NULL,
    "status" "LocalAgentPairingStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalAgentPairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocalAgentPairingCode_codeHash_key" ON "LocalAgentPairingCode"("codeHash");

-- CreateIndex
CREATE INDEX "LocalAgentPairingCode_roomId_status_expiresAt_idx" ON "LocalAgentPairingCode"("roomId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "LocalAgentPairingCode_createdByUserId_idx" ON "LocalAgentPairingCode"("createdByUserId");

-- CreateIndex
CREATE INDEX "LocalAgentPairingCode_agentId_idx" ON "LocalAgentPairingCode"("agentId");

-- AddForeignKey
ALTER TABLE "LocalAgentPairingCode" ADD CONSTRAINT "LocalAgentPairingCode_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalAgentPairingCode" ADD CONSTRAINT "LocalAgentPairingCode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalAgentPairingCode" ADD CONSTRAINT "LocalAgentPairingCode_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
