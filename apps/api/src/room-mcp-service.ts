import type { FastifyInstance } from "fastify";
import type { Prisma } from "@jean/db";
import {
  roomMcpInstructions,
  roomMcpPrompts,
  roomMcpProtocolVersion,
  roomMcpResourceTemplates,
  roomMcpTools,
  type McpPromptResult,
  type McpResource,
  type McpResourceReadResult,
  type McpToolDefinition,
  type McpToolResult
} from "@jean/mcp";
import {
  approvalRequestSchema,
  contextPackSchema,
  realtimeRoomEventSchema,
  roomAgentSchema,
  roomEventSchema,
  roomParticipantSummarySchema,
  roomTranscriptSegmentSchema,
  type AgentCapability,
  type AgentTransport,
  type ApprovalRequest,
  type ApprovalStatus,
  type ArtifactStatus,
  type ArtifactType,
  type ContextPack,
  type RealtimeArtifact,
  type RoomAgent,
  type RoomEvent,
  type RoomEventType,
  type RoomParticipantSummary,
  type RoomTranscriptSegment,
  type TaskRiskLevel,
  type TaskStatus
} from "@jean/shared";

import { HttpError, notFound } from "./errors.js";
import type { RoomAgentTokenClaims } from "./room-agent-auth.js";
import {
  appendTaskLog,
  claimTaskForAgent,
  createArtifactForTask,
  createTask,
  listRoomTaskState,
  patchArtifact,
  updateArtifact,
  updateArtifactPreviewUrl,
  updateTaskStatus
} from "./room-task-service.js";

export type CreateRoomAgentSessionInput = {
  roomId: string;
  name: string;
  provider: PersistedAgentProvider;
  transport: AgentTransport;
  capabilities: AgentCapability[];
  metadata?: Record<string, unknown>;
};

export type RoomAgentSession = {
  agent: RoomAgent;
  connectionId: string;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

type RoomRecord = {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type AgentRecord = {
  id: string;
  organizationId: string;
  name: string;
  provider: string;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
};

type AgentConnectionRecord = {
  id: string;
  agentId: string;
  transport: string;
  endpoint: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AgentParticipantRecord = {
  id: string;
  roomId: string;
  userId: string | null;
  agentId: string | null;
  role: string;
  joinedAt: Date;
  leftAt: Date | null;
  agent?: AgentRecord | null;
};

type ApprovalRecord = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string | null;
  requestedByUserId: string | null;
  requestedByAgentId: string | null;
  decidedByUserId: string | null;
  title: string;
  status: string;
  riskLevel: string;
  createdAt: Date;
  decidedAt: Date | null;
};

type AuditLogRecord = {
  id: string;
  organizationId: string | null;
  roomId: string | null;
  actorUserId: string | null;
  actorAgentId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: unknown | null;
  createdAt: Date;
};

type TaskEventRecord = {
  id: string;
  roomId: string;
  taskId: string;
  type: string;
  payload: unknown | null;
  occurredAt: Date;
};

type TranscriptSegmentRecord = {
  id: string;
  roomId: string;
  speakerUserId: string | null;
  speakerAgentId: string | null;
  text: string;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
};

type PersistedAgentProvider = "NATIVE" | "MCP" | "CODEX" | "LOVABLE" | "PERPLEXITY" | "E2B";

const supportedToolNames = new Set([
  "room.get_context_pack",
  "room.get_room_state",
  "room.get_transcript",
  "room.search_transcript",
  "room.list_participants",
  "room.list_tasks",
  "room.get_task",
  "room.list_artifacts",
  "room.read_artifact",
  "room.list_events",
  "room.get_capabilities",
  "room.create_task",
  "room.update_task_status",
  "room.assign_task",
  "room.append_log",
  "room.create_artifact",
  "room.write_artifact",
  "room.patch_artifact",
  "room.set_preview_url",
  "room.complete_task",
  "room.fail_task",
  "agent.register",
  "agent.heartbeat",
  "agent.list",
  "agent.claim_task",
  "agent.emit_event",
  "approval.request",
  "approval.get_status",
  "room.request_user_input",
  "room.speak"
]);

export const roomMcpHttpTools: McpToolDefinition[] = roomMcpTools.filter((tool) => supportedToolNames.has(tool.name));

export async function createRoomAgentSession(
  server: FastifyInstance,
  input: CreateRoomAgentSessionInput
): Promise<RoomAgentSession> {
  const room = await findRoom(server, input.roomId);
  const existingAgent = (await server.db.agent.findFirst({
    where: {
      organizationId: room.organizationId,
      name: input.name,
      provider: input.provider
    }
  })) as AgentRecord | null;
  const agent =
    existingAgent ??
    ((await server.db.agent.create({
      data: {
        organizationId: room.organizationId,
        name: input.name,
        provider: input.provider,
        capabilities: input.capabilities
      }
    })) as AgentRecord);
  const connection = (await server.db.agentConnection.create({
    data: {
      agentId: agent.id,
      transport: input.transport,
      endpoint: "room-mcp-http"
    }
  })) as AgentConnectionRecord;
  const participant = (await server.db.roomParticipant.upsert({
    where: {
      roomId_agentId: {
        roomId: room.id,
        agentId: agent.id
      }
    },
    create: {
      roomId: room.id,
      agentId: agent.id,
      role: "AGENT"
    },
    update: {
      leftAt: null
    }
  })) as AgentParticipantRecord;
  const roomAgent = serializeRoomAgent(room.id, agent, participant, input.transport, input.metadata ?? {});
  const event = await recordRoomEvent(server, {
    type: "AGENT_REGISTERED",
    roomId: room.id,
    actorAgentId: agent.id,
    payload: {
      agent: roomAgent
    }
  });

  publishRoomEvent(server, event);

  return {
    agent: roomAgent,
    connectionId: connection.id
  };
}

export async function requireRoomAgentParticipant(
  server: FastifyInstance,
  claims: RoomAgentTokenClaims
): Promise<void> {
  const [connection, participant] = await Promise.all([
    server.db.agentConnection.findFirst({
      where: {
        id: claims.sessionId,
        agentId: claims.agentId
      }
    }),
    server.db.roomParticipant.findUnique({
      where: {
        roomId_agentId: {
          roomId: claims.roomId,
          agentId: claims.agentId
        }
      }
    })
  ]);

  if (!connection || !participant) {
    throw new RoomMcpHttpError(-32001, "Room agent token no longer matches a room participant.");
  }
}

export async function handleRoomMcpJsonRpc(
  server: FastifyInstance,
  claims: RoomAgentTokenClaims,
  rawRequest: unknown
): Promise<Record<string, unknown>> {
  if (!isRecord(rawRequest) || rawRequest.jsonrpc !== "2.0" || typeof rawRequest.method !== "string") {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request.");
  }

  const request = rawRequest as JsonRpcRequest;

  try {
    await requireRoomAgentParticipant(server, claims);
    const result = await dispatchJsonRpc(server, claims, request);

    return {
      jsonrpc: "2.0",
      id: request.id ?? null,
      result
    };
  } catch (error) {
    const mcpError =
      error instanceof RoomMcpHttpError ? error : new RoomMcpHttpError(-32603, errorMessage(error));

    return jsonRpcError(request.id ?? null, mcpError.code, mcpError.message);
  }
}

export async function listRoomAgents(server: FastifyInstance, roomId: string): Promise<RoomAgent[]> {
  const participants = (await server.db.roomParticipant.findMany({
    where: {
      roomId,
      agentId: {
        not: null
      }
    },
    include: {
      agent: true
    },
    orderBy: {
      joinedAt: "asc"
    }
  })) as AgentParticipantRecord[];
  const heartbeatEvents = await listRoomAuditEvents(server, roomId, "AGENT_HEARTBEAT");
  const lastHeartbeatByAgentId = new Map<string, string>();

  for (const event of heartbeatEvents) {
    if (event.actorAgentId) {
      lastHeartbeatByAgentId.set(event.actorAgentId, event.occurredAt);
    }
  }

  return participants
    .filter((participant) => participant.agent)
    .map((participant) => {
      const agent = participant.agent as AgentRecord;

      return serializeRoomAgent(roomId, agent, participant, "HTTP", {
        lastHeartbeatAt: lastHeartbeatByAgentId.get(agent.id) ?? null
      });
    });
}

export async function listRoomApprovals(server: FastifyInstance, roomId: string): Promise<ApprovalRequest[]> {
  const approvals = (await server.db.approval.findMany({
    where: {
      roomId
    },
    orderBy: {
      createdAt: "desc"
    }
  })) as ApprovalRecord[];
  const requestEvents = await listRoomAuditEvents(server, roomId, "APPROVAL_REQUESTED");
  const requestPayloadByApprovalId = new Map<string, Record<string, unknown>>();

  for (const event of requestEvents) {
    if (event.approvalId) {
      requestPayloadByApprovalId.set(event.approvalId, event.payload);
    }
  }

  return approvals.map((approval) => serializeApproval(approval, requestPayloadByApprovalId.get(approval.id)));
}

export async function resolveRoomApproval(
  server: FastifyInstance,
  input: {
    roomId: string;
    approvalId: string;
    status: Extract<ApprovalStatus, "APPROVED" | "REJECTED" | "CANCELED">;
    decidedByUserId: string;
  }
): Promise<ApprovalRequest> {
  const existing = (await server.db.approval.findFirst({
    where: {
      id: input.approvalId,
      roomId: input.roomId
    }
  })) as ApprovalRecord | null;

  if (!existing) {
    notFound("Approval not found.");
  }

  if (existing.status !== "PENDING") {
    throw new HttpError(409, "Approval has already been decided.");
  }

  const approval = (await server.db.approval.update({
    where: {
      id: existing.id
    },
    data: {
      status: input.status,
      decidedAt: new Date(),
      decidedByUserId: input.decidedByUserId
    }
  })) as ApprovalRecord;
  const serializedApproval = serializeApproval(approval, await findApprovalRequestPayload(server, input.roomId, approval.id));
  const event = await recordRoomEvent(server, {
    type: "APPROVAL_RESOLVED",
    roomId: input.roomId,
    actorUserId: input.decidedByUserId,
    taskId: approval.taskId,
    artifactId: approval.artifactId,
    approvalId: approval.id,
    payload: {
      approval: serializedApproval
    }
  });

  publishRoomEvent(server, event);

  return serializedApproval;
}

async function dispatchJsonRpc(
  server: FastifyInstance,
  claims: RoomAgentTokenClaims,
  request: JsonRpcRequest
): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: roomMcpProtocolVersion,
        capabilities: {
          tools: {
            listChanged: false
          },
          resources: {
            subscribe: false,
            listChanged: false
          },
          prompts: {
            listChanged: false
          }
        },
        serverInfo: {
          name: "@jean/room-mcp-http",
          version: "0.1.0"
        },
        instructions: roomMcpInstructions
      };
    case "tools/list":
      return {
        tools: roomMcpHttpTools
      };
    case "tools/call": {
      const params = assertRecord(request.params, "params");
      const name = assertString(params.name, "params.name");

      if (!supportedToolNames.has(name)) {
        throw new RoomMcpHttpError(-32601, `Unsupported HTTP MCP tool: ${name}`);
      }

      return callTool(server, claims, name, assertOptionalRecord(params.arguments, "params.arguments") ?? {});
    }
    case "resources/list":
      return {
        resources: listResources(claims.roomId)
      };
    case "resources/templates/list":
      return {
        resourceTemplates: roomMcpResourceTemplates
      };
    case "resources/read": {
      const params = assertRecord(request.params, "params");

      return readResource(server, claims, assertString(params.uri, "params.uri"));
    }
    case "prompts/list":
      return {
        prompts: roomMcpPrompts
      };
    case "prompts/get": {
      const params = assertRecord(request.params, "params");

      return getPrompt(assertString(params.name, "params.name"), {
        roomId: claims.roomId,
        ...(assertOptionalRecord(params.arguments, "params.arguments") ?? {})
      });
    }
    default:
      throw new RoomMcpHttpError(-32601, `Unknown method: ${request.method}`);
  }
}

async function callTool(
  server: FastifyInstance,
  claims: RoomAgentTokenClaims,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const roomId = requireClaimRoom(claims, args);

  switch (name) {
    case "room.get_context_pack":
      return toolResult({
        contextPack: await getContextPack(server, roomId, optionalString(args.taskId))
      });
    case "room.get_room_state":
      return toolResult({
        roomState: await getRoomState(server, roomId)
      });
    case "room.get_transcript":
      return toolResult({
        transcript: takeLast(await listTranscript(server, roomId), optionalNumber(args.limit))
      });
    case "room.search_transcript": {
      const query = requiredString(args.query).toLowerCase();

      return toolResult({
        transcript: (await listTranscript(server, roomId)).filter((segment) => segment.text.toLowerCase().includes(query))
      });
    }
    case "room.list_participants":
      return toolResult({
        participants: await listParticipants(server, roomId)
      });
    case "room.list_tasks":
      return toolResult({
        tasks: (await listRoomTaskState(server, roomId)).map((item) => item.task)
      });
    case "room.get_task": {
      const taskId = requiredString(args.taskId);
      const taskItem = (await listRoomTaskState(server, roomId)).find((item) => item.task.id === taskId);

      if (!taskItem) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      return toolResult({
        task: taskItem.task,
        artifacts: taskItem.artifacts,
        logs: taskItem.logs
      });
    }
    case "room.list_artifacts":
      return toolResult({
        artifacts: await listArtifacts(server, roomId)
      });
    case "room.read_artifact": {
      const artifact = (await listArtifacts(server, roomId)).find((candidate) => candidate.id === requiredString(args.artifactId));

      if (!artifact) {
        throw new RoomMcpHttpError(-32602, "Artifact not found.");
      }

      return toolResult({ artifact });
    }
    case "room.list_events":
      return toolResult({
        events: takeLast(await listRoomEvents(server, roomId), optionalNumber(args.limit))
      });
    case "room.get_capabilities":
      return toolResult({
        capabilities: {
          protocolVersion: roomMcpProtocolVersion,
          transport: {
            current: "streamable_http",
            auth: "bearer_room_agent_token"
          },
          instructions: roomMcpInstructions,
          tools: roomMcpHttpTools.map((tool) => tool.name),
          resources: roomMcpResourceTemplates.map((resource) => resource.uriTemplate),
          prompts: roomMcpPrompts.map((prompt) => prompt.name)
        }
      });
    case "room.create_task": {
      const agentId = requireClaimAgent(claims, args);
      const result = await createTask(server, {
        roomId,
        createdByAgentId: agentId,
        assignedAgentId: agentId,
        title: requiredString(args.title),
        description: optionalString(args.description),
        riskLevel: (optionalString(args.riskLevel) ?? "LOW") as TaskRiskLevel
      });

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.update_task_status": {
      requireClaimAgent(claims, args);
      const result = await updateTaskStatus(server, {
        roomId,
        taskId: requiredString(args.taskId),
        status: requiredString(args.status) as TaskStatus
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.assign_task":
    case "agent.claim_task": {
      const agentId = requireClaimAgent(claims, args);
      const result = await claimTaskForAgent(server, {
        roomId,
        agentId,
        taskId: requiredString(args.taskId)
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.append_log": {
      requireClaimAgent(claims, args);
      const result = await appendTaskLog(server, {
        roomId,
        taskId: requiredString(args.taskId),
        message: requiredString(args.message)
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.create_artifact": {
      const agentId = requireClaimAgent(claims, args);
      const taskId = requiredString(args.taskId);
      const result = await createArtifactForTask(server, {
        roomId,
        taskId,
        createdByAgentId: agentId,
        type: requiredString(args.type) as ArtifactType,
        title: requiredString(args.title),
        content: requiredRecord(args.content, "content")
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.write_artifact": {
      requireClaimAgent(claims, args);
      const result = await updateArtifact(server, {
        roomId,
        artifactId: requiredString(args.artifactId),
        title: optionalString(args.title) ?? undefined,
        status: (optionalString(args.status) as ArtifactStatus | null) ?? undefined,
        content: requiredRecord(args.content, "content")
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Artifact not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.patch_artifact": {
      requireClaimAgent(claims, args);
      const result = await patchArtifact(server, {
        roomId,
        artifactId: requiredString(args.artifactId),
        patch: requiredRecord(args.patch, "patch")
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Artifact not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.set_preview_url": {
      requireClaimAgent(claims, args);
      const result = await updateArtifactPreviewUrl(server, {
        roomId,
        artifactId: requiredString(args.artifactId),
        previewUrl: requiredString(args.previewUrl)
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Artifact not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.complete_task": {
      requireClaimAgent(claims, args);
      const result = await updateTaskStatus(server, {
        roomId,
        taskId: requiredString(args.taskId),
        status: "COMPLETED"
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "room.fail_task": {
      const result = await updateTaskStatus(server, {
        roomId,
        taskId: requiredString(args.taskId),
        status: "FAILED"
      });

      if (!result) {
        throw new RoomMcpHttpError(-32602, "Task not found.");
      }

      const reason = optionalString(args.reason);
      if (reason) {
        const log = await appendTaskLog(server, {
          roomId,
          taskId: result.task.id,
          message: `Task failed: ${reason}`
        });

        if (log) {
          server.roomEvents.publish(log.event);
        }
      }

      server.roomEvents.publish(result.event);

      return toolResult(result);
    }
    case "agent.register":
    case "agent.heartbeat": {
      const agentId = requireClaimAgent(claims, args);
      const agent = await findRoomAgent(server, roomId, agentId);
      const event = await recordRoomEvent(server, {
        type: name === "agent.register" ? "AGENT_REGISTERED" : "AGENT_HEARTBEAT",
        roomId,
        actorAgentId: agentId,
        payload: {
          agent
        }
      });

      publishRoomEvent(server, event);

      return toolResult({ agent, event });
    }
    case "agent.list":
      return toolResult({
        agents: await listRoomAgents(server, roomId)
      });
    case "agent.emit_event": {
      const agentId = requireClaimAgent(claims, args);
      const event = await recordRoomEvent(server, {
        type: "AGENT_RUN_EVENT",
        roomId,
        actorAgentId: agentId,
        payload: {
          runId: optionalString(args.runId),
          message: requiredString(args.message),
          ...(optionalRecord(args.payload) ?? {})
        }
      });

      publishRoomEvent(server, event);

      return toolResult({ event });
    }
    case "approval.request":
      return toolResult(await requestApproval(server, claims, args));
    case "approval.get_status": {
      const approvalId = requiredString(args.approvalId);
      const approval = (await listRoomApprovals(server, roomId)).find((candidate) => candidate.id === approvalId);

      if (!approval) {
        throw new RoomMcpHttpError(-32602, "Approval not found.");
      }

      return toolResult({ approval });
    }
    case "room.request_user_input":
      return toolResult(
        await requestApproval(server, claims, {
          ...args,
          riskLevel: "LOW",
          action: "USER_INPUT",
          reason: requiredString(args.message),
          payload: {
            requestedSchema: requiredRecord(args.requestedSchema, "requestedSchema")
          }
        })
      );
    case "room.speak": {
      const agentId = requireClaimAgent(claims, args);
      const event = await recordRoomEvent(server, {
        type: "ROOM_AGENT_SPOKE",
        roomId,
        actorAgentId: agentId,
        payload: {
          text: requiredString(args.text)
        }
      });

      publishRoomEvent(server, event);

      return toolResult({ event });
    }
    default:
      throw new RoomMcpHttpError(-32601, `Unknown tool: ${name}`);
  }
}

async function requestApproval(
  server: FastifyInstance,
  claims: RoomAgentTokenClaims,
  args: Record<string, unknown>
): Promise<{ approval: ApprovalRequest; event: RoomEvent }> {
  const roomId = requireClaimRoom(claims, args);
  const agentId = requireClaimAgent(claims, args);
  const taskId = optionalString(args.taskId);
  const artifactId = optionalString(args.artifactId);

  if (taskId) {
    const taskStatus = await updateTaskStatus(server, {
      roomId,
      taskId,
      status: "WAITING_FOR_APPROVAL"
    });

    if (taskStatus) {
      server.roomEvents.publish(taskStatus.event);
    }
  }

  const approval = (await server.db.approval.create({
    data: {
      roomId,
      taskId,
      artifactId,
      requestedByAgentId: agentId,
      title: requiredString(args.action),
      status: "PENDING",
      riskLevel: requiredString(args.riskLevel) as TaskRiskLevel
    }
  })) as ApprovalRecord;
  const serializedApproval = serializeApproval(approval, {
    action: requiredString(args.action),
    reason: requiredString(args.reason),
    payload: optionalRecord(args.payload) ?? {}
  });
  const event = await recordRoomEvent(server, {
    type: "APPROVAL_REQUESTED",
    roomId,
    actorAgentId: agentId,
    taskId,
    artifactId,
    approvalId: approval.id,
    payload: {
      approval: serializedApproval
    }
  });

  publishRoomEvent(server, event);

  return {
    approval: serializedApproval,
    event
  };
}

async function getRoomState(server: FastifyInstance, roomId: string): Promise<Record<string, unknown>> {
  const room = await findRoom(server, roomId);
  const taskItems = await listRoomTaskState(server, roomId);

  return sanitizeRecord({
    room: {
      id: room.id,
      title: room.title,
      status: room.status,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
      metadata: {}
    },
    participants: await listParticipants(server, roomId),
    transcript: await listTranscript(server, roomId),
    tasks: taskItems.map((item) => item.task),
    artifacts: taskItems.flatMap((item) => item.artifacts),
    taskLogs: taskItems.flatMap((item) => item.logs),
    events: await listRoomEvents(server, roomId),
    agents: await listRoomAgents(server, roomId),
    approvals: await listRoomApprovals(server, roomId),
    agentRuns: [],
    sandboxSessions: []
  });
}

async function getContextPack(server: FastifyInstance, roomId: string, taskId: string | null): Promise<ContextPack> {
  const room = await findRoom(server, roomId);
  const taskItems = await listRoomTaskState(server, roomId);
  const task = taskId
    ? taskItems.find((item) => item.task.id === taskId)?.task ?? null
    : taskItems[taskItems.length - 1]?.task ?? null;
  const transcript = await listTranscript(server, roomId);
  const artifacts = taskItems.flatMap((item) => item.artifacts);
  const events = await listRoomEvents(server, roomId);

  return contextPackSchema.parse({
    id: `context-${roomId}-${Date.now()}`,
    roomId,
    taskId: task?.id ?? taskId,
    createdAt: new Date().toISOString(),
    objective: task?.title ?? room.title,
    instructions: [
      "La room est la source de verite.",
      "Lire le contexte avant d'agir.",
      "Ecrire les logs, artifacts, previews et approvals via les tools room.",
      "Ne pas exposer de secrets."
    ],
    transcriptSegmentIds: transcript.map((segment) => segment.id),
    artifactIds: artifacts.map((artifact) => artifact.id),
    roomEventIds: events.map((event) => event.id),
    metadata: {
      taskStatus: task?.status ?? null,
      toolCount: roomMcpHttpTools.length,
      resourceCount: roomMcpResourceTemplates.length,
      promptCount: roomMcpPrompts.length
    }
  });
}

async function readResource(
  server: FastifyInstance,
  claims: RoomAgentTokenClaims,
  uri: string
): Promise<McpResourceReadResult> {
  const match = /^room:\/\/([^/]+)\/(.+)$/.exec(uri);

  if (!match) {
    throw new RoomMcpHttpError(-32602, `Invalid room resource URI: ${uri}`);
  }

  const [, roomId, path] = match;

  if (roomId !== claims.roomId) {
    throw new RoomMcpHttpError(-32001, "Resource roomId does not match token roomId.");
  }

  const parts = path.split("/");
  let payload: Record<string, unknown>;

  if (parts[0] === "context") {
    payload = { contextPack: await getContextPack(server, roomId, null) };
  } else if (parts[0] === "transcript") {
    payload = { transcript: await listTranscript(server, roomId) };
  } else if (parts[0] === "tasks" && parts.length === 1) {
    payload = { tasks: (await listRoomTaskState(server, roomId)).map((item) => item.task) };
  } else if (parts[0] === "tasks" && parts[1]) {
    const task = (await listRoomTaskState(server, roomId)).find((item) => item.task.id === parts[1]);
    payload = task
      ? {
          task: task.task,
          artifacts: task.artifacts,
          logs: task.logs
        }
      : {};
  } else if (parts[0] === "artifacts" && parts.length === 1) {
    payload = { artifacts: await listArtifacts(server, roomId) };
  } else if (parts[0] === "artifacts" && parts[1]) {
    payload = { artifact: (await listArtifacts(server, roomId)).find((artifact) => artifact.id === parts[1]) ?? null };
  } else if (parts[0] === "events") {
    payload = { events: await listRoomEvents(server, roomId) };
  } else if (parts[0] === "agents") {
    payload = { agents: await listRoomAgents(server, roomId) };
  } else if (parts[0] === "approvals") {
    payload = { approvals: await listRoomApprovals(server, roomId) };
  } else {
    throw new RoomMcpHttpError(-32602, `Unknown room resource URI: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(sanitizeRecord(payload), null, 2)
      }
    ]
  };
}

function listResources(roomId: string): McpResource[] {
  return roomMcpResourceTemplates.map((template) => ({
    uri: template.uriTemplate.replace("{roomId}", roomId).replace("/{taskId}", "").replace("/{artifactId}", ""),
    name: template.name,
    description: template.description,
    mimeType: template.mimeType
  }));
}

function getPrompt(name: string, args: Record<string, unknown>): McpPromptResult {
  const promptDefinition = roomMcpPrompts.find((prompt) => prompt.name === name);

  if (!promptDefinition) {
    throw new RoomMcpHttpError(-32601, `Unknown prompt: ${name}`);
  }

  const roomId = requiredString(args.roomId);
  const taskId = optionalString(args.taskId);
  const artifactId = optionalString(args.artifactId);
  const scope = [
    `roomId: ${roomId}`,
    taskId ? `taskId: ${taskId}` : null,
    artifactId ? `artifactId: ${artifactId}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return {
    description: promptDefinition.description,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `${promptDefinition.description}\n\n${scope}\n\nUse room.get_context_pack first. Write logs and artifacts back through room tools. Ask for approval before sensitive actions.`
        }
      }
    ]
  };
}

async function listParticipants(server: FastifyInstance, roomId: string): Promise<RoomParticipantSummary[]> {
  const participants = (await server.db.roomParticipant.findMany({
    where: {
      roomId
    },
    include: {
      agent: true,
      user: true
    },
    orderBy: {
      joinedAt: "asc"
    }
  })) as Array<
    AgentParticipantRecord & {
      user?: { email: string; name: string | null } | null;
    }
  >;

  return participants.map((participant) =>
    roomParticipantSummarySchema.parse({
      id: participant.id,
      roomId: participant.roomId,
      userId: participant.userId,
      agentId: participant.agentId,
      role: participant.role,
      displayName:
        participant.user?.name ??
        participant.agent?.name ??
        participant.user?.email ??
        participant.userId ??
        participant.agentId ??
        "Participant",
      joinedAt: participant.joinedAt.toISOString(),
      leftAt: participant.leftAt?.toISOString() ?? null
    })
  );
}

async function listTranscript(server: FastifyInstance, roomId: string): Promise<RoomTranscriptSegment[]> {
  const segments = (await server.db.transcriptSegment.findMany({
    where: {
      roomId
    },
    orderBy: {
      startedAt: "asc"
    }
  })) as TranscriptSegmentRecord[];

  return segments.map((segment) =>
    roomTranscriptSegmentSchema.parse({
      id: segment.id,
      roomId: segment.roomId,
      speakerUserId: segment.speakerUserId,
      speakerAgentId: segment.speakerAgentId,
      text: segment.text,
      startedAt: segment.startedAt.toISOString(),
      endedAt: segment.endedAt?.toISOString() ?? null,
      createdAt: segment.createdAt.toISOString()
    })
  );
}

async function listArtifacts(server: FastifyInstance, roomId: string): Promise<RealtimeArtifact[]> {
  return (await listRoomTaskState(server, roomId)).flatMap((item) => item.artifacts);
}

async function listRoomEvents(server: FastifyInstance, roomId: string): Promise<RoomEvent[]> {
  const [taskEvents, auditEvents] = await Promise.all([
    server.db.taskEvent.findMany({
      where: {
        roomId
      },
      orderBy: [
        {
          occurredAt: "asc"
        },
        {
          id: "asc"
        }
      ]
    }) as Promise<TaskEventRecord[]>,
    listRoomAuditEvents(server, roomId)
  ]);
  const mappedTaskEvents = taskEvents.map(taskEventToRoomEvent).filter(isPresent);

  return [...mappedTaskEvents, ...auditEvents].sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
  );
}

async function listRoomAuditEvents(
  server: FastifyInstance,
  roomId: string,
  action?: RoomEventType
): Promise<RoomEvent[]> {
  const events = (await server.db.auditLog.findMany({
    where: {
      roomId,
      ...(action ? { action } : {})
    },
    orderBy: {
      createdAt: "asc"
    }
  })) as AuditLogRecord[];

  return events.map(auditLogToRoomEvent).filter(isPresent);
}

async function recordRoomEvent(
  server: FastifyInstance,
  input: {
    type: RoomEventType;
    roomId: string;
    actorUserId?: string | null;
    actorAgentId?: string | null;
    taskId?: string | null;
    artifactId?: string | null;
    approvalId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<RoomEvent> {
  const room = await findRoom(server, input.roomId);
  const payload = sanitizeRecord({
    ...(input.payload ?? {}),
    taskId: input.taskId ?? null,
    artifactId: input.artifactId ?? null,
    approvalId: input.approvalId ?? null
  });
  const auditLog = (await server.db.auditLog.create({
    data: {
      organizationId: room.organizationId,
      roomId: input.roomId,
      actorUserId: input.actorUserId ?? null,
      actorAgentId: input.actorAgentId ?? null,
      action: input.type,
      targetType: getTargetType(input),
      targetId: input.approvalId ?? input.artifactId ?? input.taskId ?? input.actorAgentId ?? input.roomId,
      payload: payload as Prisma.InputJsonValue
    }
  })) as AuditLogRecord;
  const event = auditLogToRoomEvent(auditLog);

  if (!event) {
    throw new RoomMcpHttpError(-32603, "Could not record room event.");
  }

  return event;
}

function publishRoomEvent(server: FastifyInstance, event: RoomEvent): void {
  server.roomEvents.publish(
    realtimeRoomEventSchema.parse({
      type: "room.event",
      roomId: event.roomId,
      eventId: event.id,
      event,
      ts: event.occurredAt
    })
  );
}

function taskEventToRoomEvent(taskEvent: TaskEventRecord): RoomEvent | null {
  const payload = normalizeRecord(taskEvent.payload);
  const task = isRecord(payload.task) ? payload.task : null;
  const artifact = isRecord(payload.artifact) ? payload.artifact : null;
  const eventTypeByTaskType: Record<string, RoomEventType> = {
    "task.created": "TASK_CREATED",
    "task.status": "TASK_STATUS_CHANGED",
    "task.log": "TASK_LOG_APPENDED",
    "artifact.created": "ARTIFACT_CREATED",
    "artifact.updated": "ARTIFACT_UPDATED",
    "artifact.patch": "ARTIFACT_UPDATED",
    "artifact.preview_url": "ARTIFACT_PREVIEW_SET",
    "agent.speech": "ROOM_AGENT_SPOKE"
  };
  const type = eventTypeByTaskType[taskEvent.type];

  if (!type) {
    return null;
  }

  try {
    return roomEventSchema.parse({
      id: taskEvent.id,
      roomId: taskEvent.roomId,
      type,
      occurredAt: taskEvent.occurredAt.toISOString(),
      actorUserId: null,
      actorAgentId: getString(task, "createdByAgentId") ?? getString(artifact, "createdByAgentId"),
      taskId: taskEvent.taskId,
      artifactId: getString(artifact, "id"),
      approvalId: null,
      payload: sanitizeRecord(payload)
    });
  } catch {
    return null;
  }
}

function auditLogToRoomEvent(auditLog: AuditLogRecord): RoomEvent | null {
  const payload = sanitizeRecord(normalizeRecord(auditLog.payload));

  try {
    return roomEventSchema.parse({
      id: auditLog.id,
      roomId: auditLog.roomId,
      type: auditLog.action,
      occurredAt: auditLog.createdAt.toISOString(),
      actorUserId: auditLog.actorUserId,
      actorAgentId: auditLog.actorAgentId,
      taskId: optionalRecordValue(payload, "taskId"),
      artifactId: optionalRecordValue(payload, "artifactId"),
      approvalId: optionalRecordValue(payload, "approvalId"),
      payload
    });
  } catch {
    return null;
  }
}

async function findRoomAgent(server: FastifyInstance, roomId: string, agentId: string): Promise<RoomAgent> {
  const participants = await listRoomAgents(server, roomId);
  const agent = participants.find((candidate) => candidate.id === agentId);

  if (!agent) {
    throw new RoomMcpHttpError(-32602, "Agent not found in room.");
  }

  return agent;
}

async function findRoom(server: FastifyInstance, roomId: string): Promise<RoomRecord> {
  const room = (await server.db.room.findUnique({
    where: {
      id: roomId
    }
  })) as RoomRecord | null;

  if (!room) {
    notFound("Room not found.");
  }

  return room;
}

async function findApprovalRequestPayload(
  server: FastifyInstance,
  roomId: string,
  approvalId: string
): Promise<Record<string, unknown> | undefined> {
  const events = await listRoomAuditEvents(server, roomId, "APPROVAL_REQUESTED");

  return events.find((event) => event.approvalId === approvalId)?.payload;
}

function serializeRoomAgent(
  roomId: string,
  agent: AgentRecord,
  participant: AgentParticipantRecord,
  transport: AgentTransport,
  metadata: Record<string, unknown>
): RoomAgent {
  return roomAgentSchema.parse({
    id: agent.id,
    roomId,
    name: agent.name,
    provider: agent.provider,
    transport,
    capabilities: agent.capabilities,
    registeredAt: participant.joinedAt.toISOString(),
    lastHeartbeatAt: typeof metadata.lastHeartbeatAt === "string" ? metadata.lastHeartbeatAt : null,
    metadata: sanitizeRecord(metadata)
  });
}

function serializeApproval(approval: ApprovalRecord, requestPayload?: Record<string, unknown>): ApprovalRequest {
  const approvalPayload = readNestedRecord(requestPayload, "approval");
  const payload = readNestedRecord(approvalPayload, "payload") ?? readNestedRecord(requestPayload, "payload") ?? {};

  return approvalRequestSchema.parse({
    id: approval.id,
    roomId: approval.roomId,
    taskId: approval.taskId,
    artifactId: approval.artifactId,
    requestedByAgentId: approval.requestedByAgentId,
    status: approval.status,
    riskLevel: approval.riskLevel,
    action: getString(approvalPayload, "action") ?? getString(requestPayload, "action") ?? approval.title,
    reason: getString(approvalPayload, "reason") ?? getString(requestPayload, "reason") ?? approval.title,
    payload: sanitizeRecord(payload),
    createdAt: approval.createdAt.toISOString(),
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    decidedByUserId: approval.decidedByUserId
  });
}

function getTargetType(input: {
  approvalId?: string | null;
  artifactId?: string | null;
  taskId?: string | null;
  actorAgentId?: string | null;
}): string {
  if (input.approvalId) {
    return "approval";
  }
  if (input.artifactId) {
    return "artifact";
  }
  if (input.taskId) {
    return "task";
  }
  if (input.actorAgentId) {
    return "agent";
  }

  return "room";
}

function requireClaimRoom(claims: RoomAgentTokenClaims, args: Record<string, unknown>): string {
  const roomId = optionalString(args.roomId) ?? claims.roomId;

  if (roomId !== claims.roomId) {
    throw new RoomMcpHttpError(-32001, "Tool roomId does not match token roomId.");
  }

  return roomId;
}

function requireClaimAgent(claims: RoomAgentTokenClaims, args: Record<string, unknown>): string {
  const agentId = optionalString(args.agentId);

  if (agentId && agentId !== claims.agentId) {
    throw new RoomMcpHttpError(-32001, "Tool agentId does not match token agentId.");
  }

  return claims.agentId;
}

function toolResult(data: Record<string, unknown>): McpToolResult {
  const structuredContent = sanitizeRecord(data);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeForRoom(value);

  return isRecord(sanitized) ? sanitized : {};
}

function sanitizeForRoom(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForRoom);
  }

  if (!isRecord(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretKey(key)) {
      continue;
    }

    output[key] = sanitizeForRoom(entry);
  }

  return output;
}

function isSecretKey(key: string): boolean {
  return /secret|token|password|api[_-]?key|authorization/i.test(key);
}

function jsonRpcError(id: string | number | null, code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

function takeLast<T>(items: T[], limit?: number): T[] {
  if (!limit || limit >= items.length) {
    return items;
  }

  return items.slice(items.length - limit);
}

function requiredString(value: unknown): string {
  return assertString(value, "argument");
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RoomMcpHttpError(-32602, `${path} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return assertString(value, "argument");
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number") {
    throw new RoomMcpHttpError(-32602, "argument must be a number.");
  }

  return value;
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RoomMcpHttpError(-32602, `${path} must be an object.`);
  }

  return value;
}

function assertOptionalRecord(value: unknown, path: string): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  return assertRecord(value, path);
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RoomMcpHttpError(-32602, `${path} must be an object.`);
  }

  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredRecord(value, "argument");
}

function optionalRecordValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" ? value : null;
}

function readNestedRecord(record: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  const value = record?.[key];

  return isRecord(value) ? value : null;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function getString(record: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = record?.[key];

  return typeof value === "string" && value ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Room MCP error.";
}

class RoomMcpHttpError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
  }
}
