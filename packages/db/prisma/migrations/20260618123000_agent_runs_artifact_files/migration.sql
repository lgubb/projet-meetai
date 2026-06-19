-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "taskId" TEXT,
    "agentId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunEvent" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "taskId" TEXT,
    "artifactId" TEXT,
    "runId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "visibility" TEXT NOT NULL DEFAULT 'room',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactFile" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "taskId" TEXT,
    "artifactId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "language" TEXT,
    "size" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "latestVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactFileVersion" (
    "id" TEXT NOT NULL,
    "artifactFileId" TEXT NOT NULL,
    "artifactVersionId" TEXT,
    "runId" TEXT,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactFileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactFileDiff" (
    "id" TEXT NOT NULL,
    "oldVersionId" TEXT,
    "newVersionId" TEXT NOT NULL,
    "unifiedDiff" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactFileDiff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_roomId_status_idx" ON "AgentRun"("roomId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_taskId_status_idx" ON "AgentRun"("taskId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_status_idx" ON "AgentRun"("agentId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_ownerUserId_idx" ON "AgentRun"("ownerUserId");

-- CreateIndex
CREATE INDEX "AgentRunEvent_roomId_createdAt_idx" ON "AgentRunEvent"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRunEvent_taskId_createdAt_idx" ON "AgentRunEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRunEvent_artifactId_idx" ON "AgentRunEvent"("artifactId");

-- CreateIndex
CREATE INDEX "AgentRunEvent_runId_createdAt_idx" ON "AgentRunEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRunEvent_agentId_createdAt_idx" ON "AgentRunEvent"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRunEvent_ownerUserId_idx" ON "AgentRunEvent"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactFile_artifactId_path_key" ON "ArtifactFile"("artifactId", "path");

-- CreateIndex
CREATE INDEX "ArtifactFile_roomId_path_idx" ON "ArtifactFile"("roomId", "path");

-- CreateIndex
CREATE INDEX "ArtifactFile_taskId_idx" ON "ArtifactFile"("taskId");

-- CreateIndex
CREATE INDEX "ArtifactFile_contentHash_idx" ON "ArtifactFile"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactFileVersion_artifactFileId_version_key" ON "ArtifactFileVersion"("artifactFileId", "version");

-- CreateIndex
CREATE INDEX "ArtifactFileVersion_artifactVersionId_idx" ON "ArtifactFileVersion"("artifactVersionId");

-- CreateIndex
CREATE INDEX "ArtifactFileVersion_runId_idx" ON "ArtifactFileVersion"("runId");

-- CreateIndex
CREATE INDEX "ArtifactFileVersion_contentHash_idx" ON "ArtifactFileVersion"("contentHash");

-- CreateIndex
CREATE INDEX "ArtifactFileDiff_oldVersionId_idx" ON "ArtifactFileDiff"("oldVersionId");

-- CreateIndex
CREATE INDEX "ArtifactFileDiff_newVersionId_idx" ON "ArtifactFileDiff"("newVersionId");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFile" ADD CONSTRAINT "ArtifactFile_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFile" ADD CONSTRAINT "ArtifactFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFile" ADD CONSTRAINT "ArtifactFile_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFileVersion" ADD CONSTRAINT "ArtifactFileVersion_artifactFileId_fkey" FOREIGN KEY ("artifactFileId") REFERENCES "ArtifactFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFileVersion" ADD CONSTRAINT "ArtifactFileVersion_artifactVersionId_fkey" FOREIGN KEY ("artifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFileVersion" ADD CONSTRAINT "ArtifactFileVersion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFileDiff" ADD CONSTRAINT "ArtifactFileDiff_oldVersionId_fkey" FOREIGN KEY ("oldVersionId") REFERENCES "ArtifactFileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactFileDiff" ADD CONSTRAINT "ArtifactFileDiff_newVersionId_fkey" FOREIGN KEY ("newVersionId") REFERENCES "ArtifactFileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
