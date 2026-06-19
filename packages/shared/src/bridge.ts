import { z } from "zod";

import {
  agentCapabilitySchema,
  agentProviderSchema,
  artifactTypeSchema,
  idSchema,
  isoDateTimeSchema,
  metadataSchema
} from "./domain.js";

export const bridgeProtocolVersion = "2026-06-17";

export const bridgeAgentTransportSchema = z.enum(["mock", "mcp_stdio"]);
export type BridgeAgentTransport = z.infer<typeof bridgeAgentTransportSchema>;

export const bridgeTaskTypeSchema = z.enum(["research", "code", "prototype", "doc", "unknown"]);
export type BridgeTaskType = z.infer<typeof bridgeTaskTypeSchema>;

export const bridgeLocalActionTypeSchema = z.enum(["apply_artifact_files", "run_check"]);
export type BridgeLocalActionType = z.infer<typeof bridgeLocalActionTypeSchema>;

const defaultBridgeRunConfig = {
  timeoutMs: 1000 * 60 * 15
};

export const bridgeAgentDescriptorSchema = z
  .object({
    localAgentKey: idSchema,
    agentId: idSchema,
    name: z.string().min(1),
    provider: agentProviderSchema,
    transport: bridgeAgentTransportSchema,
    capabilities: z.array(agentCapabilitySchema).min(1),
    metadata: metadataSchema.default({})
  })
  .strict();
export type BridgeAgentDescriptor = z.infer<typeof bridgeAgentDescriptorSchema>;

export const bridgeRunConfigSchema = z
  .object({
    timeoutMs: z.number().int().positive().max(1000 * 60 * 60).default(defaultBridgeRunConfig.timeoutMs)
  })
  .strict();
export type BridgeRunConfig = z.infer<typeof bridgeRunConfigSchema>;

export const bridgeClientHelloMessageSchema = z
  .object({
    type: z.literal("bridge.hello"),
    protocolVersion: z.literal(bridgeProtocolVersion),
    bridgeId: idSchema,
    roomId: idSchema,
    agent: bridgeAgentDescriptorSchema,
    runConfig: bridgeRunConfigSchema.default(defaultBridgeRunConfig)
  })
  .strict();

export const bridgeClientHeartbeatMessageSchema = z
  .object({
    type: z.literal("bridge.heartbeat"),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientTaskAcceptedMessageSchema = z
  .object({
    type: z.literal("bridge.task.accepted"),
    requestId: idSchema,
    taskId: idSchema,
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientTaskCompletedMessageSchema = z
  .object({
    type: z.literal("bridge.task.completed"),
    requestId: idSchema,
    taskId: idSchema,
    summary: z.string().min(1).nullable().default(null),
    metadata: metadataSchema.default({}),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientTaskFailedMessageSchema = z
  .object({
    type: z.literal("bridge.task.failed"),
    requestId: idSchema,
    taskId: idSchema,
    error: z.string().min(1),
    metadata: metadataSchema.default({}),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientTaskCanceledMessageSchema = z
  .object({
    type: z.literal("bridge.task.canceled"),
    requestId: idSchema,
    taskId: idSchema,
    reason: z.string().min(1).nullable().default(null),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientLocalActionAcceptedMessageSchema = z
  .object({
    type: z.literal("bridge.local_action.accepted"),
    requestId: idSchema,
    actionType: bridgeLocalActionTypeSchema,
    artifactId: idSchema,
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientLocalActionCompletedMessageSchema = z
  .object({
    type: z.literal("bridge.local_action.completed"),
    requestId: idSchema,
    actionType: bridgeLocalActionTypeSchema,
    artifactId: idSchema,
    summary: z.string().min(1).nullable().default(null),
    metadata: metadataSchema.default({}),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientLocalActionFailedMessageSchema = z
  .object({
    type: z.literal("bridge.local_action.failed"),
    requestId: idSchema,
    actionType: bridgeLocalActionTypeSchema,
    artifactId: idSchema,
    error: z.string().min(1),
    metadata: metadataSchema.default({}),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeClientMessageSchema = z.discriminatedUnion("type", [
  bridgeClientHelloMessageSchema,
  bridgeClientHeartbeatMessageSchema,
  bridgeClientTaskAcceptedMessageSchema,
  bridgeClientTaskCompletedMessageSchema,
  bridgeClientTaskFailedMessageSchema,
  bridgeClientTaskCanceledMessageSchema,
  bridgeClientLocalActionAcceptedMessageSchema,
  bridgeClientLocalActionCompletedMessageSchema,
  bridgeClientLocalActionFailedMessageSchema
]);
export type BridgeClientMessage = z.infer<typeof bridgeClientMessageSchema>;

export const bridgeServerReadyMessageSchema = z
  .object({
    type: z.literal("bridge.ready"),
    protocolVersion: z.literal(bridgeProtocolVersion),
    roomId: idSchema,
    agentId: idSchema,
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeServerPingMessageSchema = z
  .object({
    type: z.literal("bridge.ping"),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeTaskRunMessageSchema = z
  .object({
    type: z.literal("bridge.task.run"),
    requestId: idSchema,
    roomId: idSchema,
    taskId: idSchema,
    artifactId: idSchema,
    title: z.string().min(1),
    description: z.string().min(1).nullable(),
    taskType: bridgeTaskTypeSchema,
    artifactType: artifactTypeSchema,
    objective: z.string().min(1),
    mcpHttpUrl: z.string().url(),
    timeoutMs: z.number().int().positive(),
    ts: isoDateTimeSchema
  })
  .strict();
export type BridgeTaskRunMessage = z.infer<typeof bridgeTaskRunMessageSchema>;

export const bridgeTaskCancelMessageSchema = z
  .object({
    type: z.literal("bridge.task.cancel"),
    requestId: idSchema,
    taskId: idSchema,
    reason: z.string().min(1).nullable().default(null),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeLocalActionFileSchema = z
  .object({
    path: z.string().min(1),
    content: z.string(),
    contentHash: z.string().min(1),
    size: z.number().int().nonnegative()
  })
  .strict();

const bridgeLocalActionRunBaseMessageSchema = {
  type: z.literal("bridge.local_action.run"),
  requestId: idSchema,
  roomId: idSchema,
  artifactId: idSchema,
  timeoutMs: z.number().int().positive(),
  ts: isoDateTimeSchema
};

export const bridgeLocalActionRunMessageSchema = z.discriminatedUnion("actionType", [
  z
    .object({
      ...bridgeLocalActionRunBaseMessageSchema,
      actionType: z.literal("apply_artifact_files"),
      files: z.array(bridgeLocalActionFileSchema).min(1)
    })
    .strict(),
  z
    .object({
      ...bridgeLocalActionRunBaseMessageSchema,
      actionType: z.literal("run_check"),
      checkName: z.string().min(1)
    })
    .strict()
]);
export type BridgeLocalActionRunMessage = z.infer<typeof bridgeLocalActionRunMessageSchema>;

export const bridgeServerErrorMessageSchema = z
  .object({
    type: z.literal("bridge.error"),
    error: z.string().min(1),
    ts: isoDateTimeSchema
  })
  .strict();

export const bridgeServerMessageSchema = z.discriminatedUnion("type", [
  bridgeServerReadyMessageSchema,
  bridgeServerPingMessageSchema,
  bridgeTaskRunMessageSchema,
  bridgeTaskCancelMessageSchema,
  bridgeLocalActionRunMessageSchema,
  bridgeServerErrorMessageSchema
]);
export type BridgeServerMessage = z.infer<typeof bridgeServerMessageSchema>;
