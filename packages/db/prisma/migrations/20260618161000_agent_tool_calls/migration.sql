-- CreateEnum
CREATE TYPE "AgentToolCallStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED');

-- CreateTable
CREATE TABLE "AgentToolCall" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "taskId" TEXT,
    "artifactId" TEXT,
    "approvalId" TEXT,
    "agentId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" "AgentToolCallStatus" NOT NULL DEFAULT 'RUNNING',
    "arguments" JSONB,
    "result" JSONB,
    "errorCode" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentToolCall_roomId_startedAt_idx" ON "AgentToolCall"("roomId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_taskId_startedAt_idx" ON "AgentToolCall"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_artifactId_startedAt_idx" ON "AgentToolCall"("artifactId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_approvalId_idx" ON "AgentToolCall"("approvalId");

-- CreateIndex
CREATE INDEX "AgentToolCall_agentId_startedAt_idx" ON "AgentToolCall"("agentId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_roomId_status_idx" ON "AgentToolCall"("roomId", "status");

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
