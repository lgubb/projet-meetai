-- CreateEnum
CREATE TYPE "SandboxProvider" AS ENUM ('LOCAL_MOCK', 'E2B', 'VERCEL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SandboxSessionStatus" AS ENUM ('CREATED', 'READY', 'RUNNING', 'STOPPED', 'FAILED');

-- CreateTable
CREATE TABLE "SandboxSession" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "taskId" TEXT,
    "createdByAgentId" TEXT,
    "provider" "SandboxProvider" NOT NULL,
    "status" "SandboxSessionStatus" NOT NULL DEFAULT 'CREATED',
    "workdir" TEXT NOT NULL,
    "previewUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SandboxSession_roomId_status_idx" ON "SandboxSession"("roomId", "status");

-- CreateIndex
CREATE INDEX "SandboxSession_taskId_idx" ON "SandboxSession"("taskId");

-- CreateIndex
CREATE INDEX "SandboxSession_createdByAgentId_idx" ON "SandboxSession"("createdByAgentId");

-- AddForeignKey
ALTER TABLE "SandboxSession" ADD CONSTRAINT "SandboxSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxSession" ADD CONSTRAINT "SandboxSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxSession" ADD CONSTRAINT "SandboxSession_createdByAgentId_fkey" FOREIGN KEY ("createdByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
