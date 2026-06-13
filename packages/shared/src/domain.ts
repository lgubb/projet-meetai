import { z } from "zod";

export const userRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const roomStatusSchema = z.enum(["CREATED", "LIVE", "ENDED", "ARCHIVED"]);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const participantRoleSchema = z.enum(["HOST", "MEMBER", "GUEST", "OBSERVER", "AGENT"]);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const agentProviderSchema = z.enum(["NATIVE", "MCP", "CODEX", "LOVABLE", "PERPLEXITY", "E2B"]);
export type AgentProvider = z.infer<typeof agentProviderSchema>;

export const agentTransportSchema = z.enum(["IN_PROCESS", "HTTP", "STDIO"]);
export type AgentTransport = z.infer<typeof agentTransportSchema>;

export const agentCapabilitySchema = z.enum([
  "ORCHESTRATION",
  "RESEARCH",
  "CODE_GENERATION",
  "PROTOTYPING",
  "TASK_PLANNING",
  "ARTIFACT_GENERATION"
]);
export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

export const taskStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELED"
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskRiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type TaskRiskLevel = z.infer<typeof taskRiskLevelSchema>;

export const artifactTypeSchema = z.enum(["DOCUMENT", "CODE", "RESEARCH", "DIAGRAM", "PREVIEW", "LOG"]);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const artifactStatusSchema = z.enum(["DRAFT", "GENERATING", "READY", "FAILED", "ARCHIVED"]);
export type ArtifactStatus = z.infer<typeof artifactStatusSchema>;

export const approvalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELED"]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const roomEventTypeSchema = z.enum([
  "ROOM_CREATED",
  "ROOM_STATUS_CHANGED",
  "PARTICIPANT_JOINED",
  "PARTICIPANT_LEFT",
  "TASK_CREATED",
  "TASK_STATUS_CHANGED",
  "ARTIFACT_CREATED",
  "ARTIFACT_UPDATED",
  "APPROVAL_REQUESTED",
  "APPROVAL_RESOLVED",
  "TRANSCRIPT_SEGMENT_CREATED"
]);
export type RoomEventType = z.infer<typeof roomEventTypeSchema>;

export const idSchema = z.string().min(1);
export const metadataSchema = z.record(z.string(), z.unknown());
export const isoDateTimeSchema = z.string().datetime();

export const realtimeTaskSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    createdByUserId: idSchema.nullable(),
    createdByAgentId: idSchema.nullable(),
    assignedAgentId: idSchema.nullable(),
    title: z.string().min(1),
    description: z.string().min(1).nullable(),
    status: taskStatusSchema,
    riskLevel: taskRiskLevelSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable()
  })
  .strict();
export type RealtimeTask = z.infer<typeof realtimeTaskSchema>;

export const realtimeArtifactSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    taskId: idSchema.nullable(),
    createdByUserId: idSchema.nullable(),
    createdByAgentId: idSchema.nullable(),
    type: artifactTypeSchema,
    status: artifactStatusSchema,
    title: z.string().min(1),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    latestVersion: z
      .object({
        id: idSchema,
        version: z.number().int().positive(),
        content: metadataSchema,
        createdAt: isoDateTimeSchema
      })
      .strict()
      .nullable()
  })
  .strict();
export type RealtimeArtifact = z.infer<typeof realtimeArtifactSchema>;

const transcriptEventBaseSchema = z
  .object({
    roomId: idSchema,
    speakerId: idSchema,
    text: z.string().min(1),
    ts: isoDateTimeSchema,
    startedAt: isoDateTimeSchema.optional(),
    endedAt: isoDateTimeSchema.optional()
  })
  .strict();

export const transcriptPartialEventSchema = transcriptEventBaseSchema
  .extend({
    type: z.literal("transcript.partial")
  })
  .strict();

export const transcriptFinalEventSchema = transcriptEventBaseSchema
  .extend({
    type: z.literal("transcript.final"),
    segmentId: idSchema.optional()
  })
  .strict();

export const taskCreatedEventSchema = z
  .object({
    type: z.literal("task.created"),
    roomId: idSchema,
    task: realtimeTaskSchema,
    ts: isoDateTimeSchema
  })
  .strict();

export const artifactCreatedEventSchema = z
  .object({
    type: z.literal("artifact.created"),
    roomId: idSchema,
    artifact: realtimeArtifactSchema,
    ts: isoDateTimeSchema
  })
  .strict();

export const agentSpeechEventSchema = z
  .object({
    type: z.literal("agent.speech"),
    roomId: idSchema,
    agentId: idSchema,
    text: z.string().min(1),
    ts: isoDateTimeSchema
  })
  .strict();

export const realtimeRoomEventSchema = z.discriminatedUnion("type", [
  transcriptPartialEventSchema,
  transcriptFinalEventSchema,
  taskCreatedEventSchema,
  artifactCreatedEventSchema,
  agentSpeechEventSchema
]);
export type RealtimeRoomEvent = z.infer<typeof realtimeRoomEventSchema>;

export const healthStatusSchema = z
  .object({
    service: z.string().min(1),
    ok: z.boolean()
  })
  .strict();
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const roomEventSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    type: roomEventTypeSchema,
    occurredAt: isoDateTimeSchema,
    actorUserId: idSchema.nullable(),
    actorAgentId: idSchema.nullable(),
    taskId: idSchema.nullable(),
    artifactId: idSchema.nullable(),
    approvalId: idSchema.nullable(),
    payload: metadataSchema
  })
  .strict();
export type RoomEvent = z.infer<typeof roomEventSchema>;

export const contextPackSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    taskId: idSchema.nullable(),
    createdAt: isoDateTimeSchema,
    objective: z.string().min(1),
    instructions: z.array(z.string().min(1)),
    transcriptSegmentIds: z.array(idSchema),
    artifactIds: z.array(idSchema),
    roomEventIds: z.array(idSchema),
    metadata: metadataSchema
  })
  .strict();
export type ContextPack = z.infer<typeof contextPackSchema>;
