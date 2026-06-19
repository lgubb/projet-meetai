import { z } from "zod";

export const userRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const roomStatusSchema = z.enum(["CREATED", "LIVE", "ENDED", "ARCHIVED"]);
export type RoomStatus = z.infer<typeof roomStatusSchema>;

export const roomTemplateIdSchema = z.enum(["blank", "product_jam", "research_call", "prototype_session"]);
export type RoomTemplateId = z.infer<typeof roomTemplateIdSchema>;

export const participantRoleSchema = z.enum(["HOST", "MEMBER", "GUEST", "OBSERVER", "AGENT"]);
export type ParticipantRole = z.infer<typeof participantRoleSchema>;

export const agentProviderSchema = z.enum([
  "NATIVE",
  "MCP",
  "CODEX",
  "CLAUDE_CODE",
  "LOVABLE",
  "V0",
  "PERPLEXITY",
  "E2B",
  "CUSTOM"
]);
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

export const agentRunStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELED"
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const sandboxProviderSchema = z.enum(["LOCAL_MOCK", "E2B", "VERCEL", "CUSTOM"]);
export type SandboxProvider = z.infer<typeof sandboxProviderSchema>;

export const sandboxSessionStatusSchema = z.enum(["CREATED", "READY", "RUNNING", "STOPPED", "FAILED"]);
export type SandboxSessionStatus = z.infer<typeof sandboxSessionStatusSchema>;

export const roomEventTypeSchema = z.enum([
  "ROOM_CREATED",
  "ROOM_STATUS_CHANGED",
  "PARTICIPANT_JOINED",
  "PARTICIPANT_LEFT",
  "AGENT_REGISTERED",
  "AGENT_HEARTBEAT",
  "AGENT_RUN_STARTED",
  "AGENT_RUN_EVENT",
  "AGENT_RUN_FINISHED",
  "AGENT_TOOL_CALL_BLOCKED",
  "TASK_CREATED",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_LOG_APPENDED",
  "ARTIFACT_CREATED",
  "ARTIFACT_UPDATED",
  "ARTIFACT_PREVIEW_SET",
  "APPROVAL_REQUESTED",
  "APPROVAL_RESOLVED",
  "LOCAL_ACTION_STARTED",
  "LOCAL_ACTION_FINISHED",
  "LOCAL_ACTION_FAILED",
  "USER_INPUT_REQUESTED",
  "SANDBOX_SESSION_CREATED",
  "SANDBOX_FILES_WRITTEN",
  "SANDBOX_SERVER_STARTED",
  "SANDBOX_PREVIEW_PUBLISHED",
  "SANDBOX_SESSION_STOPPED",
  "ROOM_AGENT_SPOKE",
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

export const realtimeTaskLogSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    taskId: idSchema,
    message: z.string().min(1),
    createdAt: isoDateTimeSchema
  })
  .strict();
export type RealtimeTaskLog = z.infer<typeof realtimeTaskLogSchema>;

export const roomParticipantSummarySchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    userId: idSchema.nullable(),
    agentId: idSchema.nullable(),
    role: participantRoleSchema,
    displayName: z.string().min(1),
    joinedAt: isoDateTimeSchema,
    leftAt: isoDateTimeSchema.nullable()
  })
  .strict();
export type RoomParticipantSummary = z.infer<typeof roomParticipantSummarySchema>;

export const roomTranscriptSegmentSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    speakerUserId: idSchema.nullable(),
    speakerAgentId: idSchema.nullable(),
    text: z.string().min(1),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema
  })
  .strict();
export type RoomTranscriptSegment = z.infer<typeof roomTranscriptSegmentSchema>;

export const roomAgentSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    name: z.string().min(1),
    provider: agentProviderSchema,
    transport: agentTransportSchema,
    capabilities: z.array(agentCapabilitySchema),
    registeredAt: isoDateTimeSchema,
    lastHeartbeatAt: isoDateTimeSchema.nullable(),
    metadata: metadataSchema
  })
  .strict();
export type RoomAgent = z.infer<typeof roomAgentSchema>;

export const agentRunSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    agentId: idSchema,
    ownerUserId: idSchema.nullable(),
    taskId: idSchema.nullable(),
    status: agentRunStatusSchema,
    startedAt: isoDateTimeSchema,
    finishedAt: isoDateTimeSchema.nullable(),
    summary: z.string().min(1).nullable(),
    metadata: metadataSchema
  })
  .strict();
export type AgentRun = z.infer<typeof agentRunSchema>;

export const approvalRequestSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    taskId: idSchema.nullable(),
    artifactId: idSchema.nullable(),
    requestedByAgentId: idSchema.nullable(),
    status: approvalStatusSchema,
    riskLevel: taskRiskLevelSchema,
    action: z.string().min(1),
    reason: z.string().min(1),
    payload: metadataSchema,
    createdAt: isoDateTimeSchema,
    decidedAt: isoDateTimeSchema.nullable(),
    decidedByUserId: idSchema.nullable()
  })
  .strict();
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

export const sandboxSessionSchema = z
  .object({
    id: idSchema,
    roomId: idSchema,
    taskId: idSchema.nullable(),
    createdByAgentId: idSchema.nullable(),
    provider: sandboxProviderSchema,
    status: sandboxSessionStatusSchema,
    workdir: z.string().min(1),
    previewUrl: z.string().url().nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    metadata: metadataSchema
  })
  .strict();
export type SandboxSession = z.infer<typeof sandboxSessionSchema>;

const persistedEventFields = {
  eventId: idSchema.optional()
};

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
    type: z.literal("transcript.partial"),
    ...persistedEventFields
  })
  .strict();

export const transcriptFinalEventSchema = transcriptEventBaseSchema
  .extend({
    type: z.literal("transcript.final"),
    segmentId: idSchema.optional(),
    ...persistedEventFields
  })
  .strict();

export const taskCreatedEventSchema = z
  .object({
    type: z.literal("task.created"),
    roomId: idSchema,
    task: realtimeTaskSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const taskStatusEventSchema = z
  .object({
    type: z.literal("task.status"),
    roomId: idSchema,
    task: realtimeTaskSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const taskLogEventSchema = z
  .object({
    type: z.literal("task.log"),
    roomId: idSchema,
    taskId: idSchema,
    log: realtimeTaskLogSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const artifactCreatedEventSchema = z
  .object({
    type: z.literal("artifact.created"),
    roomId: idSchema,
    artifact: realtimeArtifactSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const artifactUpdatedEventSchema = z
  .object({
    type: z.literal("artifact.updated"),
    roomId: idSchema,
    artifact: realtimeArtifactSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const artifactPatchEventSchema = z
  .object({
    type: z.literal("artifact.patch"),
    roomId: idSchema,
    artifact: realtimeArtifactSchema,
    patch: metadataSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const artifactPreviewUrlEventSchema = z
  .object({
    type: z.literal("artifact.preview_url"),
    roomId: idSchema,
    artifact: realtimeArtifactSchema,
    previewUrl: z.string().url(),
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const agentSpeechEventSchema = z
  .object({
    type: z.literal("agent.speech"),
    roomId: idSchema,
    agentId: idSchema,
    text: z.string().min(1),
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const roomAuditRealtimeEventSchema = z
  .object({
    type: z.literal("room.event"),
    roomId: idSchema,
    event: roomEventSchema,
    ts: isoDateTimeSchema,
    ...persistedEventFields
  })
  .strict();

export const realtimeRoomEventSchema = z.discriminatedUnion("type", [
  transcriptPartialEventSchema,
  transcriptFinalEventSchema,
  taskCreatedEventSchema,
  taskStatusEventSchema,
  taskLogEventSchema,
  artifactCreatedEventSchema,
  artifactUpdatedEventSchema,
  artifactPatchEventSchema,
  artifactPreviewUrlEventSchema,
  agentSpeechEventSchema,
  roomAuditRealtimeEventSchema
]);
export type RealtimeRoomEvent = z.infer<typeof realtimeRoomEventSchema>;

export const healthStatusSchema = z
  .object({
    service: z.string().min(1),
    ok: z.boolean()
  })
  .strict();
export type HealthStatus = z.infer<typeof healthStatusSchema>;

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
