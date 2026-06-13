import type { PrismaClient } from "@jean/db";

export type ApiDatabase = Pick<
  PrismaClient,
  | "agent"
  | "artifact"
  | "artifactVersion"
  | "organization"
  | "organizationMember"
  | "room"
  | "roomParticipant"
  | "task"
  | "taskEvent"
  | "transcriptSegment"
  | "user"
  | "$disconnect"
>;
