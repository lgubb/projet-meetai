-- CreateTable
CREATE TABLE "RoomComment" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "artifactId" TEXT,
    "artifactFileId" TEXT,
    "agentRunEventId" TEXT,
    "createdByUserId" TEXT,
    "lineNumber" INTEGER,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomComment_roomId_createdAt_idx" ON "RoomComment"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "RoomComment_artifactId_idx" ON "RoomComment"("artifactId");

-- CreateIndex
CREATE INDEX "RoomComment_artifactFileId_idx" ON "RoomComment"("artifactFileId");

-- CreateIndex
CREATE INDEX "RoomComment_agentRunEventId_idx" ON "RoomComment"("agentRunEventId");

-- CreateIndex
CREATE INDEX "RoomComment_createdByUserId_idx" ON "RoomComment"("createdByUserId");

-- AddForeignKey
ALTER TABLE "RoomComment" ADD CONSTRAINT "RoomComment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomComment" ADD CONSTRAINT "RoomComment_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomComment" ADD CONSTRAINT "RoomComment_artifactFileId_fkey" FOREIGN KEY ("artifactFileId") REFERENCES "ArtifactFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomComment" ADD CONSTRAINT "RoomComment_agentRunEventId_fkey" FOREIGN KEY ("agentRunEventId") REFERENCES "AgentRunEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomComment" ADD CONSTRAINT "RoomComment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
