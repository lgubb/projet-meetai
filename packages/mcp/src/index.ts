import {
  agentRunSchema,
  approvalRequestSchema,
  contextPackSchema,
  realtimeArtifactSchema,
  realtimeTaskLogSchema,
  realtimeTaskSchema,
  roomAgentSchema,
  roomEventSchema,
  roomParticipantSummarySchema,
  roomTranscriptSegmentSchema,
  sandboxSessionSchema,
  type AgentCapability,
  type AgentProvider,
  type AgentRun,
  type AgentRunStatus,
  type AgentTransport,
  type ApprovalRequest,
  type ArtifactStatus,
  type ArtifactType,
  type ContextPack,
  type RealtimeArtifact,
  type RealtimeTask,
  type RealtimeTaskLog,
  type RoomAgent,
  type RoomEvent,
  type RoomEventType,
  type RoomParticipantSummary,
  type RoomStatus,
  type RoomTranscriptSegment,
  type SandboxProvider,
  type SandboxSession,
  type TaskRiskLevel,
  type TaskStatus
} from "@jean/shared";

export const roomMcpProtocolVersion = "2025-06-18";
export const roomMcpPackageName = "mcp";

export type McpJsonSchema = {
  type: "object" | "array" | "string" | "number" | "boolean";
  description?: string;
  properties?: Record<string, McpJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: McpJsonSchema;
  enum?: Array<string | number | boolean | null>;
  format?: "uri" | "date-time";
  minLength?: number;
};

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: McpJsonSchema;
  outputSchema: McpJsonSchema;
};

export type McpResourceTemplate = {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: "application/json";
};

export type McpResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json";
};

export type McpPromptDefinition = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
};

export type McpToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

export type McpPromptResult = {
  description: string;
  messages: Array<{
    role: "user";
    content: {
      type: "text";
      text: string;
    };
  }>;
};

export type McpResourceReadResult = {
  contents: Array<{
    uri: string;
    mimeType: "application/json";
    text: string;
  }>;
};

export type RoomMcpRoom = {
  id: string;
  title: string;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type RoomMcpState = {
  room: RoomMcpRoom;
  participants: RoomParticipantSummary[];
  transcript: RoomTranscriptSegment[];
  tasks: RealtimeTask[];
  artifacts: RealtimeArtifact[];
  taskLogs: RealtimeTaskLog[];
  events: RoomEvent[];
  agents: RoomAgent[];
  agentRuns: AgentRun[];
  approvals: ApprovalRequest[];
  sandboxSessions: SandboxSession[];
};

export type RoomMcpServerOptions = {
  rooms?: RoomMcpState[];
  defaultRoomId?: string;
  now?: () => Date;
  sandboxProvider?: RoomPreviewProvider;
};

export type PreviewFile = {
  path: string;
  content: string;
};

export interface RoomPreviewProvider {
  createSession(input: {
    roomId: string;
    taskId: string | null;
    provider: SandboxProvider;
    workdir: string;
  }): Promise<{ providerSessionId: string | null; workdir?: string }>;
  writeFiles(input: { providerSessionId: string | null; files: PreviewFile[] }): Promise<void>;
  startServer(input: { providerSessionId: string | null; command: string; port: number }): Promise<void>;
  publishUrl(input: { providerSessionId: string | null; port: number }): Promise<string>;
  stopSession(input: { providerSessionId: string | null }): Promise<void>;
}

type RoomEventInput = {
  type: RoomEventType;
  roomId: string;
  actorAgentId?: string | null;
  taskId?: string | null;
  artifactId?: string | null;
  approvalId?: string | null;
  payload?: Record<string, unknown>;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

const objectOutputSchema: McpJsonSchema = {
  type: "object",
  additionalProperties: true
};

const textSchema = (description: string): McpJsonSchema => ({
  type: "string",
  minLength: 1,
  description
});

const nullableTextSchema = (description: string): McpJsonSchema => ({
  type: "string",
  description
});

const numberSchema = (description: string): McpJsonSchema => ({
  type: "number",
  description
});

const metadataSchema: McpJsonSchema = {
  type: "object",
  description: "Free-form JSON metadata. Secrets are stripped before events or resources are returned.",
  additionalProperties: true
};

const previewFilesSchema: McpJsonSchema = {
  type: "array",
  description: "Files to write in the sandbox.",
  items: {
    type: "object",
    required: ["path", "content"],
    additionalProperties: false,
    properties: {
      path: textSchema("Sandbox-relative file path."),
      content: textSchema("File content.")
    }
  }
};

const roomIdProperty = {
  roomId: textSchema("Room identifier.")
};

function tool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, McpJsonSchema>,
  required: string[]
): McpToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false
    },
    outputSchema: objectOutputSchema
  };
}

export const roomMcpTools: McpToolDefinition[] = [
  tool("room.get_context_pack", "Get Context Pack", "Return compact room context for an agent run.", {
    ...roomIdProperty,
    taskId: nullableTextSchema("Optional task identifier.")
  }, ["roomId"]),
  tool("room.get_room_state", "Get Room State", "Return sanitized room state.", roomIdProperty, ["roomId"]),
  tool("room.get_transcript", "Get Transcript", "Return transcript segments.", {
    ...roomIdProperty,
    limit: numberSchema("Maximum number of segments.")
  }, ["roomId"]),
  tool("room.search_transcript", "Search Transcript", "Search transcript text.", {
    ...roomIdProperty,
    query: textSchema("Search query.")
  }, ["roomId", "query"]),
  tool("room.list_participants", "List Participants", "List room participants.", roomIdProperty, ["roomId"]),
  tool("room.list_tasks", "List Tasks", "List room tasks.", roomIdProperty, ["roomId"]),
  tool("room.get_task", "Get Task", "Read a task with logs and related artifacts.", {
    ...roomIdProperty,
    taskId: textSchema("Task identifier.")
  }, ["roomId", "taskId"]),
  tool("room.list_artifacts", "List Artifacts", "List room artifacts.", roomIdProperty, ["roomId"]),
  tool("room.read_artifact", "Read Artifact", "Read an artifact and its latest version.", {
    ...roomIdProperty,
    artifactId: textSchema("Artifact identifier.")
  }, ["roomId", "artifactId"]),
  tool("room.list_events", "List Events", "List auditable room events.", {
    ...roomIdProperty,
    limit: numberSchema("Maximum number of events.")
  }, ["roomId"]),
  tool("room.get_capabilities", "Get Capabilities", "Return the room MCP catalogue.", roomIdProperty, ["roomId"]),

  tool("room.create_task", "Create Task", "Create a room task.", {
    ...roomIdProperty,
    agentId: nullableTextSchema("Creating agent identifier."),
    title: textSchema("Task title."),
    description: nullableTextSchema("Task description."),
    riskLevel: { ...textSchema("Task risk."), enum: ["LOW", "MEDIUM", "HIGH"] }
  }, ["roomId", "title"]),
  tool("room.update_task_status", "Update Task Status", "Update a task status.", {
    ...roomIdProperty,
    taskId: textSchema("Task identifier."),
    status: {
      ...textSchema("New task status."),
      enum: ["PENDING", "RUNNING", "WAITING_FOR_APPROVAL", "COMPLETED", "FAILED", "CANCELED"]
    }
  }, ["roomId", "taskId", "status"]),
  tool("room.assign_task", "Assign Task", "Assign a task to an agent.", {
    ...roomIdProperty,
    taskId: textSchema("Task identifier."),
    agentId: textSchema("Agent identifier.")
  }, ["roomId", "taskId", "agentId"]),
  tool("room.append_log", "Append Log", "Append a task log entry.", {
    ...roomIdProperty,
    taskId: textSchema("Task identifier."),
    message: textSchema("Log message.")
  }, ["roomId", "taskId", "message"]),
  tool("room.create_artifact", "Create Artifact", "Create an artifact.", {
    ...roomIdProperty,
    taskId: nullableTextSchema("Optional task identifier."),
    agentId: nullableTextSchema("Creating agent identifier."),
    type: { ...textSchema("Artifact type."), enum: ["DOCUMENT", "CODE", "RESEARCH", "DIAGRAM", "PREVIEW", "LOG"] },
    title: textSchema("Artifact title."),
    content: metadataSchema
  }, ["roomId", "type", "title", "content"]),
  tool("room.write_artifact", "Write Artifact", "Replace artifact content with a new version.", {
    ...roomIdProperty,
    artifactId: textSchema("Artifact identifier."),
    title: nullableTextSchema("Optional new title."),
    status: {
      ...nullableTextSchema("Optional artifact status."),
      enum: ["DRAFT", "GENERATING", "READY", "FAILED", "ARCHIVED"]
    },
    content: metadataSchema
  }, ["roomId", "artifactId", "content"]),
  tool("room.patch_artifact", "Patch Artifact", "Patch artifact content with a shallow merge.", {
    ...roomIdProperty,
    artifactId: textSchema("Artifact identifier."),
    patch: metadataSchema
  }, ["roomId", "artifactId", "patch"]),
  tool("room.set_preview_url", "Set Preview URL", "Attach a preview URL to an artifact.", {
    ...roomIdProperty,
    artifactId: textSchema("Artifact identifier."),
    previewUrl: { ...textSchema("Preview URL."), format: "uri" }
  }, ["roomId", "artifactId", "previewUrl"]),
  tool("room.complete_task", "Complete Task", "Mark a task as completed.", {
    ...roomIdProperty,
    taskId: textSchema("Task identifier.")
  }, ["roomId", "taskId"]),
  tool("room.fail_task", "Fail Task", "Mark a task as failed.", {
    ...roomIdProperty,
    taskId: textSchema("Task identifier."),
    reason: nullableTextSchema("Failure reason.")
  }, ["roomId", "taskId"]),

  tool("preview.create_session", "Create Preview Session", "Create a sandbox-backed preview session.", {
    ...roomIdProperty,
    taskId: nullableTextSchema("Optional task identifier."),
    agentId: nullableTextSchema("Creating agent identifier."),
    provider: { ...textSchema("Sandbox provider."), enum: ["LOCAL_MOCK", "E2B", "VERCEL", "CUSTOM"] },
    workdir: nullableTextSchema("Sandbox working directory.")
  }, ["roomId"]),
  tool("preview.write_files", "Write Preview Files", "Write files into a sandbox session.", {
    ...roomIdProperty,
    sessionId: textSchema("Sandbox session identifier."),
    files: previewFilesSchema
  }, ["roomId", "sessionId", "files"]),
  tool("preview.start_server", "Start Preview Server", "Start a sandbox preview server.", {
    ...roomIdProperty,
    sessionId: textSchema("Sandbox session identifier."),
    command: textSchema("Server command."),
    port: numberSchema("Server port.")
  }, ["roomId", "sessionId", "command", "port"]),
  tool("preview.publish_url", "Publish Preview URL", "Publish the sandbox preview URL and optionally attach it to an artifact.", {
    ...roomIdProperty,
    sessionId: textSchema("Sandbox session identifier."),
    artifactId: nullableTextSchema("Optional artifact identifier."),
    port: numberSchema("Server port.")
  }, ["roomId", "sessionId", "port"]),
  tool("preview.stop_session", "Stop Preview Session", "Stop a sandbox preview session.", {
    ...roomIdProperty,
    sessionId: textSchema("Sandbox session identifier.")
  }, ["roomId", "sessionId"]),

  tool("agent.register", "Register Agent", "Register an agent in the room.", {
    ...roomIdProperty,
    name: textSchema("Agent name."),
    provider: {
      ...textSchema("Agent provider."),
      enum: ["NATIVE", "MCP", "CODEX", "CLAUDE_CODE", "LOVABLE", "V0", "PERPLEXITY", "E2B", "CUSTOM"]
    },
    transport: { ...textSchema("Agent transport."), enum: ["IN_PROCESS", "HTTP", "STDIO"] },
    capabilities: {
      type: "array",
      description: "Agent capabilities.",
      items: {
        ...textSchema("Capability."),
        enum: ["ORCHESTRATION", "RESEARCH", "CODE_GENERATION", "PROTOTYPING", "TASK_PLANNING", "ARTIFACT_GENERATION"]
      }
    },
    metadata: metadataSchema
  }, ["roomId", "name", "provider", "transport", "capabilities"]),
  tool("agent.heartbeat", "Agent Heartbeat", "Record an agent heartbeat.", {
    ...roomIdProperty,
    agentId: textSchema("Agent identifier.")
  }, ["roomId", "agentId"]),
  tool("agent.list", "List Agents", "List registered agents.", roomIdProperty, ["roomId"]),
  tool("agent.claim_task", "Claim Task", "Assign a pending task to an agent and mark it running.", {
    ...roomIdProperty,
    agentId: textSchema("Agent identifier."),
    taskId: textSchema("Task identifier.")
  }, ["roomId", "agentId", "taskId"]),
  tool("agent.start_run", "Start Agent Run", "Start an auditable agent run.", {
    ...roomIdProperty,
    agentId: textSchema("Agent identifier."),
    taskId: nullableTextSchema("Optional task identifier."),
    metadata: metadataSchema
  }, ["roomId", "agentId"]),
  tool("agent.emit_event", "Emit Agent Event", "Emit an event for an agent run.", {
    ...roomIdProperty,
    agentId: textSchema("Agent identifier."),
    runId: nullableTextSchema("Optional run identifier."),
    message: textSchema("Event message."),
    payload: metadataSchema
  }, ["roomId", "agentId", "message"]),
  tool("agent.finish_run", "Finish Agent Run", "Finish an agent run.", {
    ...roomIdProperty,
    runId: textSchema("Run identifier."),
    status: { ...textSchema("Final run status."), enum: ["COMPLETED", "FAILED", "CANCELED"] },
    summary: nullableTextSchema("Run summary.")
  }, ["roomId", "runId", "status"]),

  tool("approval.request", "Request Approval", "Create an auditable approval request.", {
    ...roomIdProperty,
    agentId: nullableTextSchema("Requesting agent identifier."),
    taskId: nullableTextSchema("Optional task identifier."),
    artifactId: nullableTextSchema("Optional artifact identifier."),
    riskLevel: { ...textSchema("Risk level."), enum: ["LOW", "MEDIUM", "HIGH"] },
    action: textSchema("Action requiring approval."),
    reason: textSchema("Reason approval is required."),
    payload: metadataSchema
  }, ["roomId", "riskLevel", "action", "reason"]),
  tool("approval.get_status", "Get Approval Status", "Read approval status.", {
    ...roomIdProperty,
    approvalId: textSchema("Approval identifier.")
  }, ["roomId", "approvalId"]),
  tool("room.request_user_input", "Request User Input", "Create a user input request mapped to MCP elicitation.", {
    ...roomIdProperty,
    agentId: nullableTextSchema("Requesting agent identifier."),
    taskId: nullableTextSchema("Optional task identifier."),
    message: textSchema("Message shown to the user."),
    requestedSchema: metadataSchema
  }, ["roomId", "message", "requestedSchema"]),
  tool("room.speak", "Room Speak", "Emit agent speech through the room event stream.", {
    ...roomIdProperty,
    agentId: textSchema("Speaking agent identifier."),
    text: textSchema("Speech text.")
  }, ["roomId", "agentId", "text"])
];

export const roomMcpResourceTemplates: McpResourceTemplate[] = [
  resourceTemplate("room://{roomId}/context", "Room context", "Sanitized context pack."),
  resourceTemplate("room://{roomId}/transcript", "Room transcript", "Transcript segments."),
  resourceTemplate("room://{roomId}/tasks", "Room tasks", "Tasks in the room."),
  resourceTemplate("room://{roomId}/tasks/{taskId}", "Room task", "Single task with logs and artifacts."),
  resourceTemplate("room://{roomId}/artifacts", "Room artifacts", "Artifacts in the room."),
  resourceTemplate("room://{roomId}/artifacts/{artifactId}", "Room artifact", "Single artifact."),
  resourceTemplate("room://{roomId}/events", "Room events", "Auditable room events."),
  resourceTemplate("room://{roomId}/agents", "Room agents", "Registered agents."),
  resourceTemplate("room://{roomId}/approvals", "Room approvals", "Approval requests.")
];

export const roomMcpPrompts: McpPromptDefinition[] = [
  prompt("workroom.plan_task", "Plan Task", "Plan a room task using only room context.", ["roomId", "taskId"]),
  prompt("workroom.research_brief", "Research Brief", "Prepare a sourced research brief.", ["roomId", "taskId"]),
  prompt("workroom.code_preview", "Code Preview", "Build a sandboxed preview artifact.", ["roomId", "taskId"]),
  prompt("workroom.deck_outline", "Deck Outline", "Outline a presentation artifact.", ["roomId", "taskId"]),
  prompt("workroom.review_artifact", "Review Artifact", "Review an artifact against task goals.", [
    "roomId",
    "artifactId"
  ]),
  prompt("workroom.request_approval", "Request Approval", "Draft an approval request for a sensitive action.", [
    "roomId",
    "taskId"
  ])
];

export const roomMcpInstructions =
  "Use the room as the source of truth. Read context before acting, write all task logs and artifacts through room tools, request approval for sensitive actions, and never send secrets in tool payloads.";

export class RoomMcpError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
  }
}

export class RoomMcpServer {
  private readonly rooms = new Map<string, RoomMcpState>();
  private readonly defaultRoomId: string;
  private readonly now: () => Date;
  private readonly sandboxProvider: RoomPreviewProvider;
  private idCounter = 0;

  constructor(options: RoomMcpServerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.sandboxProvider = options.sandboxProvider ?? createLocalMockPreviewProvider();

    const initialRooms = options.rooms?.length ? options.rooms : [createInitialRoomMcpState()];

    for (const room of initialRooms) {
      this.rooms.set(room.room.id, cloneState(room));
    }

    this.defaultRoomId = options.defaultRoomId ?? initialRooms[0]?.room.id ?? "room-1";
  }

  listTools(): McpToolDefinition[] {
    return roomMcpTools;
  }

  listResourceTemplates(): McpResourceTemplate[] {
    return roomMcpResourceTemplates;
  }

  listPrompts(): McpPromptDefinition[] {
    return roomMcpPrompts;
  }

  listResources(roomId = this.defaultRoomId): McpResource[] {
    this.getState(roomId);

    return roomMcpResourceTemplates.map((template) => ({
      uri: template.uriTemplate.replace("{roomId}", roomId).replace("/{taskId}", "").replace("/{artifactId}", ""),
      name: template.name,
      description: template.description,
      mimeType: template.mimeType
    }));
  }

  async callTool(name: string, rawArguments: unknown): Promise<McpToolResult> {
    const definition = roomMcpTools.find((candidate) => candidate.name === name);

    if (!definition) {
      throw new RoomMcpError(-32601, `Unknown tool: ${name}`);
    }

    validateJsonSchema(rawArguments ?? {}, definition.inputSchema, "arguments");
    const args = rawArguments as Record<string, unknown>;
    const data = await this.dispatchTool(name, args);

    return toolResult(data);
  }

  readResource(uri: string): McpResourceReadResult {
    const payload = this.readResourcePayload(uri);
    const safePayload = sanitizeForRoom(payload);

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(safePayload, null, 2)
        }
      ]
    };
  }

  getPrompt(name: string, args: Record<string, unknown> = {}): McpPromptResult {
    const promptDefinition = roomMcpPrompts.find((candidate) => candidate.name === name);

    if (!promptDefinition) {
      throw new RoomMcpError(-32601, `Unknown prompt: ${name}`);
    }

    const roomId = optionalString(args.roomId) ?? this.defaultRoomId;
    const taskId = optionalString(args.taskId);
    const artifactId = optionalString(args.artifactId);
    const scope = [
      `roomId: ${roomId}`,
      taskId ? `taskId: ${taskId}` : null,
      artifactId ? `artifactId: ${artifactId}` : null
    ]
      .filter(isPresent)
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

  async handleJsonRpc(rawRequest: unknown): Promise<Record<string, unknown>> {
    if (!isRecord(rawRequest) || rawRequest.jsonrpc !== "2.0" || typeof rawRequest.method !== "string") {
      return jsonRpcError(null, -32600, "Invalid JSON-RPC request.");
    }

    const request = rawRequest as JsonRpcRequest;

    try {
      const result = await this.dispatchJsonRpc(request);

      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result
      };
    } catch (error) {
      const mcpError = error instanceof RoomMcpError ? error : new RoomMcpError(-32603, asErrorMessage(error));

      return jsonRpcError(request.id ?? null, mcpError.code, mcpError.message);
    }
  }

  getRoomState(roomId = this.defaultRoomId): RoomMcpState {
    return cloneState(this.getState(roomId));
  }

  private async dispatchJsonRpc(request: JsonRpcRequest): Promise<unknown> {
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
            name: "@jean/room-mcp",
            version: "0.1.0"
          },
          instructions: roomMcpInstructions
        };
      case "tools/list":
        return {
          tools: this.listTools()
        };
      case "tools/call": {
        const params = assertRecord(request.params, "params");
        const name = assertString(params.name, "params.name");
        const result = await this.callTool(name, params.arguments ?? {});

        return result;
      }
      case "resources/list":
        return {
          resources: this.listResources(optionalString(assertOptionalRecord(request.params, "params")?.roomId) ?? undefined)
        };
      case "resources/templates/list":
        return {
          resourceTemplates: this.listResourceTemplates()
        };
      case "resources/read": {
        const params = assertRecord(request.params, "params");
        return this.readResource(assertString(params.uri, "params.uri"));
      }
      case "prompts/list":
        return {
          prompts: this.listPrompts()
        };
      case "prompts/get": {
        const params = assertRecord(request.params, "params");
        return this.getPrompt(assertString(params.name, "params.name"), assertOptionalRecord(params.arguments, "params.arguments") ?? {});
      }
      default:
        throw new RoomMcpError(-32601, `Unknown method: ${request.method}`);
    }
  }

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (name) {
      case "room.get_context_pack":
        return {
          contextPack: this.getContextPack(requiredString(args.roomId), optionalString(args.taskId))
        };
      case "room.get_room_state":
        return {
          roomState: sanitizeForRoom(this.getState(requiredString(args.roomId)))
        };
      case "room.get_transcript":
        return {
          transcript: takeLast(this.getState(requiredString(args.roomId)).transcript, optionalNumber(args.limit))
        };
      case "room.search_transcript": {
        const query = requiredString(args.query).toLowerCase();
        return {
          transcript: this.getState(requiredString(args.roomId)).transcript.filter((segment) =>
            segment.text.toLowerCase().includes(query)
          )
        };
      }
      case "room.list_participants":
        return {
          participants: this.getState(requiredString(args.roomId)).participants
        };
      case "room.list_tasks":
        return {
          tasks: this.getState(requiredString(args.roomId)).tasks
        };
      case "room.get_task":
        return this.getTaskBundle(requiredString(args.roomId), requiredString(args.taskId));
      case "room.list_artifacts":
        return {
          artifacts: this.getState(requiredString(args.roomId)).artifacts
        };
      case "room.read_artifact":
        return {
          artifact: this.findArtifact(requiredString(args.roomId), requiredString(args.artifactId))
        };
      case "room.list_events":
        return {
          events: takeLast(this.getState(requiredString(args.roomId)).events, optionalNumber(args.limit))
        };
      case "room.get_capabilities":
        return {
          capabilities: this.getCapabilities(requiredString(args.roomId))
        };
      case "room.create_task":
        return this.createTask(args);
      case "room.update_task_status":
        return this.updateTaskStatus(requiredString(args.roomId), requiredString(args.taskId), requiredString(args.status) as TaskStatus);
      case "room.assign_task":
        return this.assignTask(requiredString(args.roomId), requiredString(args.taskId), requiredString(args.agentId));
      case "room.append_log":
        return this.appendLog(requiredString(args.roomId), requiredString(args.taskId), requiredString(args.message));
      case "room.create_artifact":
        return this.createArtifact(args);
      case "room.write_artifact":
        return this.writeArtifact(args);
      case "room.patch_artifact":
        return this.patchArtifact(requiredString(args.roomId), requiredString(args.artifactId), requiredRecord(args.patch, "patch"));
      case "room.set_preview_url":
        return this.setPreviewUrl(requiredString(args.roomId), requiredString(args.artifactId), requiredString(args.previewUrl));
      case "room.complete_task":
        return this.updateTaskStatus(requiredString(args.roomId), requiredString(args.taskId), "COMPLETED");
      case "room.fail_task": {
        const result = this.updateTaskStatus(requiredString(args.roomId), requiredString(args.taskId), "FAILED");
        const reason = optionalString(args.reason);
        if (reason) {
          this.appendLog(requiredString(args.roomId), requiredString(args.taskId), `Task failed: ${reason}`);
        }
        return result;
      }
      case "preview.create_session":
        return this.createPreviewSession(args);
      case "preview.write_files":
        return this.writePreviewFiles(requiredString(args.roomId), requiredString(args.sessionId), requiredFiles(args.files));
      case "preview.start_server":
        return this.startPreviewServer(
          requiredString(args.roomId),
          requiredString(args.sessionId),
          requiredString(args.command),
          requiredNumber(args.port)
        );
      case "preview.publish_url":
        return this.publishPreviewUrl(
          requiredString(args.roomId),
          requiredString(args.sessionId),
          requiredNumber(args.port),
          optionalString(args.artifactId)
        );
      case "preview.stop_session":
        return this.stopPreviewSession(requiredString(args.roomId), requiredString(args.sessionId));
      case "agent.register":
        return this.registerAgent(args);
      case "agent.heartbeat":
        return this.agentHeartbeat(requiredString(args.roomId), requiredString(args.agentId));
      case "agent.list":
        return {
          agents: this.getState(requiredString(args.roomId)).agents
        };
      case "agent.claim_task":
        return this.claimTask(requiredString(args.roomId), requiredString(args.agentId), requiredString(args.taskId));
      case "agent.start_run":
        return this.startRun(args);
      case "agent.emit_event":
        return this.emitAgentEvent(args);
      case "agent.finish_run":
        return this.finishRun(requiredString(args.roomId), requiredString(args.runId), requiredString(args.status) as AgentRunStatus, optionalString(args.summary));
      case "approval.request":
        return this.requestApproval(args);
      case "approval.get_status":
        return {
          approval: this.findApproval(requiredString(args.roomId), requiredString(args.approvalId))
        };
      case "room.request_user_input":
        return this.requestUserInput(args);
      case "room.speak":
        return this.roomSpeak(requiredString(args.roomId), requiredString(args.agentId), requiredString(args.text));
      default:
        throw new RoomMcpError(-32601, `Unknown tool: ${name}`);
    }
  }

  private getContextPack(roomId: string, taskId: string | null = null): ContextPack {
    const state = this.getState(roomId);
    const task = taskId ? this.findTask(roomId, taskId) : state.tasks.at(-1) ?? null;
    const contextPack = contextPackSchema.parse({
      id: this.nextId("context"),
      roomId,
      taskId: task?.id ?? taskId,
      createdAt: this.nowIso(),
      objective: task?.title ?? state.room.title,
      instructions: [
        "La room est la source de verite.",
        "Lire le contexte avant d'agir.",
        "Ecrire les logs, artifacts, previews et approvals via les tools room.",
        "Ne pas exposer de secrets."
      ],
      transcriptSegmentIds: state.transcript.map((segment) => segment.id),
      artifactIds: state.artifacts.map((artifact) => artifact.id),
      roomEventIds: state.events.map((event) => event.id),
      metadata: {
        taskStatus: task?.status ?? null,
        toolCount: roomMcpTools.length,
        resourceCount: roomMcpResourceTemplates.length,
        promptCount: roomMcpPrompts.length
      }
    });

    return contextPack;
  }

  private getTaskBundle(roomId: string, taskId: string): Record<string, unknown> {
    const state = this.getState(roomId);
    const task = this.findTask(roomId, taskId);

    return {
      task,
      logs: state.taskLogs.filter((log) => log.taskId === taskId),
      artifacts: state.artifacts.filter((artifact) => artifact.taskId === taskId),
      approvals: state.approvals.filter((approval) => approval.taskId === taskId)
    };
  }

  private getCapabilities(roomId: string): Record<string, unknown> {
    this.getState(roomId);

    return {
      protocolVersion: roomMcpProtocolVersion,
      transport: {
        recommended: "streamable_http",
        localTesting: ["stdio", "in_process"],
        auth: "required_per_room_session_agent_token"
      },
      instructions: roomMcpInstructions,
      tools: roomMcpTools.map((toolDefinition) => toolDefinition.name),
      resources: roomMcpResourceTemplates.map((resource) => resource.uriTemplate),
      prompts: roomMcpPrompts.map((promptDefinition) => promptDefinition.name)
    };
  }

  private createTask(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const state = this.getState(roomId);
    const now = this.nowIso();
    const task = realtimeTaskSchema.parse({
      id: this.nextId("task"),
      roomId,
      createdByUserId: null,
      createdByAgentId: optionalString(args.agentId),
      assignedAgentId: optionalString(args.agentId),
      title: requiredString(args.title),
      description: optionalString(args.description),
      status: "PENDING",
      riskLevel: (optionalString(args.riskLevel) ?? "LOW") as TaskRiskLevel,
      createdAt: now,
      updatedAt: now,
      completedAt: null
    });

    state.tasks.push(task);
    const event = this.recordEvent(state, {
      type: "TASK_CREATED",
      roomId,
      actorAgentId: task.createdByAgentId,
      taskId: task.id,
      payload: {
        task
      }
    });

    return { task, event };
  }

  private updateTaskStatus(roomId: string, taskId: string, status: TaskStatus): Record<string, unknown> {
    const state = this.getState(roomId);
    const task = this.findTask(roomId, taskId);
    const updatedTask = realtimeTaskSchema.parse({
      ...task,
      status,
      updatedAt: this.nowIso(),
      completedAt: isTerminalTaskStatus(status) ? this.nowIso() : null
    });

    replaceById(state.tasks, updatedTask);
    const event = this.recordEvent(state, {
      type: "TASK_STATUS_CHANGED",
      roomId,
      actorAgentId: updatedTask.assignedAgentId,
      taskId,
      payload: {
        task: updatedTask
      }
    });

    return { task: updatedTask, event };
  }

  private assignTask(roomId: string, taskId: string, agentId: string): Record<string, unknown> {
    const state = this.getState(roomId);
    this.findAgent(roomId, agentId);
    const task = this.findTask(roomId, taskId);
    const updatedTask = realtimeTaskSchema.parse({
      ...task,
      assignedAgentId: agentId,
      updatedAt: this.nowIso()
    });

    replaceById(state.tasks, updatedTask);
    const event = this.recordEvent(state, {
      type: "TASK_ASSIGNED",
      roomId,
      actorAgentId: agentId,
      taskId,
      payload: {
        task: updatedTask
      }
    });

    return { task: updatedTask, event };
  }

  private appendLog(roomId: string, taskId: string, message: string): Record<string, unknown> {
    const state = this.getState(roomId);
    this.findTask(roomId, taskId);
    const now = this.nowIso();
    const log = realtimeTaskLogSchema.parse({
      id: this.nextId("log"),
      roomId,
      taskId,
      message,
      createdAt: now
    });

    state.taskLogs.push(log);
    const event = this.recordEvent(state, {
      type: "TASK_LOG_APPENDED",
      roomId,
      taskId,
      payload: {
        log
      }
    });

    return { log, event };
  }

  private createArtifact(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const state = this.getState(roomId);
    const now = this.nowIso();
    const taskId = optionalString(args.taskId);

    if (taskId) {
      this.findTask(roomId, taskId);
    }

    const artifact = realtimeArtifactSchema.parse({
      id: this.nextId("artifact"),
      roomId,
      taskId,
      createdByUserId: null,
      createdByAgentId: optionalString(args.agentId),
      type: requiredString(args.type) as ArtifactType,
      status: "DRAFT",
      title: requiredString(args.title),
      createdAt: now,
      updatedAt: now,
      latestVersion: {
        id: this.nextId("version"),
        version: 1,
        content: requiredRecord(args.content, "content"),
        createdAt: now
      }
    });

    state.artifacts.push(artifact);
    const event = this.recordEvent(state, {
      type: "ARTIFACT_CREATED",
      roomId,
      actorAgentId: artifact.createdByAgentId,
      taskId,
      artifactId: artifact.id,
      payload: {
        artifact
      }
    });

    return { artifact, event };
  }

  private writeArtifact(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const artifact = this.findArtifact(roomId, requiredString(args.artifactId));
    const updatedArtifact = this.nextArtifactVersion(artifact, requiredRecord(args.content, "content"), {
      title: optionalString(args.title) ?? artifact.title,
      status: (optionalString(args.status) as ArtifactStatus | null) ?? artifact.status
    });

    return this.updateArtifact(roomId, updatedArtifact, "ARTIFACT_UPDATED", {});
  }

  private patchArtifact(roomId: string, artifactId: string, patch: Record<string, unknown>): Record<string, unknown> {
    const artifact = this.findArtifact(roomId, artifactId);
    const previousContent = artifact.latestVersion?.content ?? {};
    const updatedArtifact = this.nextArtifactVersion(artifact, {
      ...previousContent,
      ...patch
    });

    return this.updateArtifact(roomId, updatedArtifact, "ARTIFACT_UPDATED", { patch });
  }

  private setPreviewUrl(roomId: string, artifactId: string, previewUrl: string): Record<string, unknown> {
    const artifact = this.findArtifact(roomId, artifactId);
    const previousContent = artifact.latestVersion?.content ?? {};
    const updatedArtifact = this.nextArtifactVersion(
      artifact,
      {
        ...previousContent,
        previewUrl
      },
      {
        status: "READY"
      }
    );

    return this.updateArtifact(roomId, updatedArtifact, "ARTIFACT_PREVIEW_SET", { previewUrl });
  }

  private updateArtifact(
    roomId: string,
    artifact: RealtimeArtifact,
    eventType: RoomEventType,
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    const state = this.getState(roomId);
    replaceById(state.artifacts, artifact);
    const event = this.recordEvent(state, {
      type: eventType,
      roomId,
      actorAgentId: artifact.createdByAgentId,
      taskId: artifact.taskId,
      artifactId: artifact.id,
      payload: {
        artifact,
        ...payload
      }
    });

    return { artifact, event };
  }

  private nextArtifactVersion(
    artifact: RealtimeArtifact,
    content: Record<string, unknown>,
    overrides: Partial<Pick<RealtimeArtifact, "status" | "title">> = {}
  ): RealtimeArtifact {
    const now = this.nowIso();

    return realtimeArtifactSchema.parse({
      ...artifact,
      ...overrides,
      updatedAt: now,
      latestVersion: {
        id: this.nextId("version"),
        version: (artifact.latestVersion?.version ?? 0) + 1,
        content,
        createdAt: now
      }
    });
  }

  private async createPreviewSession(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const roomId = requiredString(args.roomId);
    const state = this.getState(roomId);
    const taskId = optionalString(args.taskId);
    const provider = (optionalString(args.provider) ?? "LOCAL_MOCK") as SandboxProvider;
    const workdir = optionalString(args.workdir) ?? "/tmp/workroom-preview";

    if (taskId) {
      this.findTask(roomId, taskId);
    }

    const providerSession = await this.sandboxProvider.createSession({
      roomId,
      taskId,
      provider,
      workdir
    });
    const now = this.nowIso();
    const session = sandboxSessionSchema.parse({
      id: this.nextId("sandbox"),
      roomId,
      taskId,
      createdByAgentId: optionalString(args.agentId),
      provider,
      status: "CREATED",
      workdir: providerSession.workdir ?? workdir,
      previewUrl: null,
      createdAt: now,
      updatedAt: now,
      metadata: {
        providerSessionId: providerSession.providerSessionId
      }
    });

    state.sandboxSessions.push(session);
    const event = this.recordEvent(state, {
      type: "SANDBOX_SESSION_CREATED",
      roomId,
      actorAgentId: session.createdByAgentId,
      taskId,
      payload: {
        session
      }
    });

    return { session, event };
  }

  private async writePreviewFiles(roomId: string, sessionId: string, files: PreviewFile[]): Promise<Record<string, unknown>> {
    const state = this.getState(roomId);
    const session = this.findSandboxSession(roomId, sessionId);
    await this.sandboxProvider.writeFiles({
      providerSessionId: optionalString(session.metadata.providerSessionId),
      files
    });
    const updatedSession = sandboxSessionSchema.parse({
      ...session,
      updatedAt: this.nowIso(),
      metadata: {
        ...session.metadata,
        files
      }
    });

    replaceById(state.sandboxSessions, updatedSession);
    const event = this.recordEvent(state, {
      type: "SANDBOX_FILES_WRITTEN",
      roomId,
      actorAgentId: session.createdByAgentId,
      taskId: session.taskId,
      payload: {
        session: updatedSession,
        files
      }
    });

    return { session: updatedSession, event };
  }

  private async startPreviewServer(roomId: string, sessionId: string, command: string, port: number): Promise<Record<string, unknown>> {
    const state = this.getState(roomId);
    const session = this.findSandboxSession(roomId, sessionId);
    await this.sandboxProvider.startServer({
      providerSessionId: optionalString(session.metadata.providerSessionId),
      command,
      port
    });
    const updatedSession = sandboxSessionSchema.parse({
      ...session,
      status: "RUNNING",
      updatedAt: this.nowIso(),
      metadata: {
        ...session.metadata,
        command,
        port
      }
    });

    replaceById(state.sandboxSessions, updatedSession);
    const event = this.recordEvent(state, {
      type: "SANDBOX_SERVER_STARTED",
      roomId,
      actorAgentId: session.createdByAgentId,
      taskId: session.taskId,
      payload: {
        session: updatedSession,
        command,
        port
      }
    });

    return { session: updatedSession, event };
  }

  private async publishPreviewUrl(
    roomId: string,
    sessionId: string,
    port: number,
    artifactId: string | null
  ): Promise<Record<string, unknown>> {
    const state = this.getState(roomId);
    const session = this.findSandboxSession(roomId, sessionId);
    const previewUrl = await this.sandboxProvider.publishUrl({
      providerSessionId: optionalString(session.metadata.providerSessionId),
      port
    });
    const updatedSession = sandboxSessionSchema.parse({
      ...session,
      status: "READY",
      previewUrl,
      updatedAt: this.nowIso(),
      metadata: {
        ...session.metadata,
        port
      }
    });

    replaceById(state.sandboxSessions, updatedSession);
    const event = this.recordEvent(state, {
      type: "SANDBOX_PREVIEW_PUBLISHED",
      roomId,
      actorAgentId: session.createdByAgentId,
      taskId: session.taskId,
      artifactId,
      payload: {
        session: updatedSession,
        previewUrl
      }
    });

    let artifact: RealtimeArtifact | null = null;
    if (artifactId) {
      artifact = this.setPreviewUrl(roomId, artifactId, previewUrl).artifact as RealtimeArtifact;
    }

    return { session: updatedSession, artifact, event };
  }

  private async stopPreviewSession(roomId: string, sessionId: string): Promise<Record<string, unknown>> {
    const state = this.getState(roomId);
    const session = this.findSandboxSession(roomId, sessionId);
    await this.sandboxProvider.stopSession({
      providerSessionId: optionalString(session.metadata.providerSessionId)
    });
    const updatedSession = sandboxSessionSchema.parse({
      ...session,
      status: "STOPPED",
      updatedAt: this.nowIso()
    });

    replaceById(state.sandboxSessions, updatedSession);
    const event = this.recordEvent(state, {
      type: "SANDBOX_SESSION_STOPPED",
      roomId,
      actorAgentId: session.createdByAgentId,
      taskId: session.taskId,
      payload: {
        session: updatedSession
      }
    });

    return { session: updatedSession, event };
  }

  private registerAgent(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const state = this.getState(roomId);
    const now = this.nowIso();
    const agent = roomAgentSchema.parse({
      id: this.nextId("agent"),
      roomId,
      name: requiredString(args.name),
      provider: requiredString(args.provider) as AgentProvider,
      transport: requiredString(args.transport) as AgentTransport,
      capabilities: requiredArray(args.capabilities, "capabilities") as AgentCapability[],
      registeredAt: now,
      lastHeartbeatAt: now,
      metadata: optionalRecord(args.metadata) ?? {}
    });

    state.agents.push(agent);
    state.participants.push(
      roomParticipantSummarySchema.parse({
        id: this.nextId("participant"),
        roomId,
        userId: null,
        agentId: agent.id,
        role: "AGENT",
        displayName: agent.name,
        joinedAt: now,
        leftAt: null
      })
    );
    const event = this.recordEvent(state, {
      type: "AGENT_REGISTERED",
      roomId,
      actorAgentId: agent.id,
      payload: {
        agent
      }
    });

    return { agent, event };
  }

  private agentHeartbeat(roomId: string, agentId: string): Record<string, unknown> {
    const state = this.getState(roomId);
    const agent = this.findAgent(roomId, agentId);
    const updatedAgent = roomAgentSchema.parse({
      ...agent,
      lastHeartbeatAt: this.nowIso()
    });

    replaceById(state.agents, updatedAgent);
    const event = this.recordEvent(state, {
      type: "AGENT_HEARTBEAT",
      roomId,
      actorAgentId: agentId,
      payload: {
        agent: updatedAgent
      }
    });

    return { agent: updatedAgent, event };
  }

  private claimTask(roomId: string, agentId: string, taskId: string): Record<string, unknown> {
    this.assignTask(roomId, taskId, agentId);
    const statusResult = this.updateTaskStatus(roomId, taskId, "RUNNING");

    return {
      task: statusResult.task,
      events: takeLast(this.getState(roomId).events, 2)
    };
  }

  private startRun(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const state = this.getState(roomId);
    const agentId = requiredString(args.agentId);
    const taskId = optionalString(args.taskId);
    this.findAgent(roomId, agentId);

    if (taskId) {
      this.findTask(roomId, taskId);
    }

    const run = agentRunSchema.parse({
      id: this.nextId("run"),
      roomId,
      agentId,
      taskId,
      status: "RUNNING",
      startedAt: this.nowIso(),
      finishedAt: null,
      summary: null,
      metadata: optionalRecord(args.metadata) ?? {}
    });

    state.agentRuns.push(run);
    const event = this.recordEvent(state, {
      type: "AGENT_RUN_STARTED",
      roomId,
      actorAgentId: agentId,
      taskId,
      payload: {
        run
      }
    });

    return { run, event };
  }

  private emitAgentEvent(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const agentId = requiredString(args.agentId);
    this.findAgent(roomId, agentId);
    const runId = optionalString(args.runId);

    if (runId) {
      this.findRun(roomId, runId);
    }

    const event = this.recordEvent(this.getState(roomId), {
      type: "AGENT_RUN_EVENT",
      roomId,
      actorAgentId: agentId,
      payload: {
        runId,
        message: requiredString(args.message),
        ...(optionalRecord(args.payload) ?? {})
      }
    });

    return { event };
  }

  private finishRun(roomId: string, runId: string, status: AgentRunStatus, summary: string | null): Record<string, unknown> {
    const state = this.getState(roomId);
    const run = this.findRun(roomId, runId);
    const updatedRun = agentRunSchema.parse({
      ...run,
      status,
      summary,
      finishedAt: this.nowIso()
    });

    replaceById(state.agentRuns, updatedRun);
    const event = this.recordEvent(state, {
      type: "AGENT_RUN_FINISHED",
      roomId,
      actorAgentId: run.agentId,
      taskId: run.taskId,
      payload: {
        run: updatedRun
      }
    });

    return { run: updatedRun, event };
  }

  private requestApproval(args: Record<string, unknown>): Record<string, unknown> {
    const roomId = requiredString(args.roomId);
    const state = this.getState(roomId);
    const taskId = optionalString(args.taskId);
    const artifactId = optionalString(args.artifactId);

    if (taskId) {
      this.updateTaskStatus(roomId, taskId, "WAITING_FOR_APPROVAL");
    }
    if (artifactId) {
      this.findArtifact(roomId, artifactId);
    }

    const approval = approvalRequestSchema.parse({
      id: this.nextId("approval"),
      roomId,
      taskId,
      artifactId,
      requestedByAgentId: optionalString(args.agentId),
      status: "PENDING",
      riskLevel: requiredString(args.riskLevel) as TaskRiskLevel,
      action: requiredString(args.action),
      reason: requiredString(args.reason),
      payload: optionalRecord(args.payload) ?? {},
      createdAt: this.nowIso(),
      decidedAt: null,
      decidedByUserId: null
    });

    state.approvals.push(approval);
    const event = this.recordEvent(state, {
      type: "APPROVAL_REQUESTED",
      roomId,
      actorAgentId: approval.requestedByAgentId,
      taskId,
      artifactId,
      approvalId: approval.id,
      payload: {
        approval
      }
    });

    return { approval, event };
  }

  private requestUserInput(args: Record<string, unknown>): Record<string, unknown> {
    const approval = this.requestApproval({
      roomId: requiredString(args.roomId),
      agentId: optionalString(args.agentId),
      taskId: optionalString(args.taskId),
      riskLevel: "LOW",
      action: "USER_INPUT",
      reason: requiredString(args.message),
      payload: {
        requestedSchema: requiredRecord(args.requestedSchema, "requestedSchema")
      }
    }).approval as ApprovalRequest;
    const event = this.recordEvent(this.getState(approval.roomId), {
      type: "USER_INPUT_REQUESTED",
      roomId: approval.roomId,
      actorAgentId: approval.requestedByAgentId,
      taskId: approval.taskId,
      approvalId: approval.id,
      payload: {
        approval
      }
    });

    return { approval, event };
  }

  private roomSpeak(roomId: string, agentId: string, text: string): Record<string, unknown> {
    this.findAgent(roomId, agentId);
    const event = this.recordEvent(this.getState(roomId), {
      type: "ROOM_AGENT_SPOKE",
      roomId,
      actorAgentId: agentId,
      payload: {
        text
      }
    });

    return { event };
  }

  private readResourcePayload(uri: string): Record<string, unknown> {
    const match = /^room:\/\/([^/]+)\/(.+)$/.exec(uri);

    if (!match) {
      throw new RoomMcpError(-32602, `Invalid room resource URI: ${uri}`);
    }

    const [, roomId, path] = match;
    const state = this.getState(roomId);
    const parts = path.split("/");

    if (parts[0] === "context") {
      return { contextPack: this.getContextPack(roomId) };
    }
    if (parts[0] === "transcript") {
      return { transcript: state.transcript };
    }
    if (parts[0] === "tasks" && parts.length === 1) {
      return { tasks: state.tasks };
    }
    if (parts[0] === "tasks" && parts[1]) {
      return this.getTaskBundle(roomId, parts[1]);
    }
    if (parts[0] === "artifacts" && parts.length === 1) {
      return { artifacts: state.artifacts };
    }
    if (parts[0] === "artifacts" && parts[1]) {
      return { artifact: this.findArtifact(roomId, parts[1]) };
    }
    if (parts[0] === "events") {
      return { events: state.events };
    }
    if (parts[0] === "agents") {
      return { agents: state.agents };
    }
    if (parts[0] === "approvals") {
      return { approvals: state.approvals };
    }

    throw new RoomMcpError(-32602, `Unknown room resource URI: ${uri}`);
  }

  private recordEvent(state: RoomMcpState, input: RoomEventInput): RoomEvent {
    const event = roomEventSchema.parse({
      id: this.nextId("event"),
      roomId: input.roomId,
      type: input.type,
      occurredAt: this.nowIso(),
      actorUserId: null,
      actorAgentId: input.actorAgentId ?? null,
      taskId: input.taskId ?? null,
      artifactId: input.artifactId ?? null,
      approvalId: input.approvalId ?? null,
      payload: sanitizeRecord(input.payload ?? {})
    });

    state.events.push(event);
    return event;
  }

  private findTask(roomId: string, taskId: string): RealtimeTask {
    const task = this.getState(roomId).tasks.find((candidate) => candidate.id === taskId);

    if (!task) {
      throw new RoomMcpError(-32602, `Task not found in room ${roomId}: ${taskId}`);
    }

    return task;
  }

  private findArtifact(roomId: string, artifactId: string): RealtimeArtifact {
    const artifact = this.getState(roomId).artifacts.find((candidate) => candidate.id === artifactId);

    if (!artifact) {
      throw new RoomMcpError(-32602, `Artifact not found in room ${roomId}: ${artifactId}`);
    }

    return artifact;
  }

  private findAgent(roomId: string, agentId: string): RoomAgent {
    const agent = this.getState(roomId).agents.find((candidate) => candidate.id === agentId);

    if (!agent) {
      throw new RoomMcpError(-32602, `Agent not found in room ${roomId}: ${agentId}`);
    }

    return agent;
  }

  private findRun(roomId: string, runId: string): AgentRun {
    const run = this.getState(roomId).agentRuns.find((candidate) => candidate.id === runId);

    if (!run) {
      throw new RoomMcpError(-32602, `Agent run not found in room ${roomId}: ${runId}`);
    }

    return run;
  }

  private findApproval(roomId: string, approvalId: string): ApprovalRequest {
    const approval = this.getState(roomId).approvals.find((candidate) => candidate.id === approvalId);

    if (!approval) {
      throw new RoomMcpError(-32602, `Approval not found in room ${roomId}: ${approvalId}`);
    }

    return approval;
  }

  private findSandboxSession(roomId: string, sessionId: string): SandboxSession {
    const session = this.getState(roomId).sandboxSessions.find((candidate) => candidate.id === sessionId);

    if (!session) {
      throw new RoomMcpError(-32602, `Sandbox session not found in room ${roomId}: ${sessionId}`);
    }

    return session;
  }

  private getState(roomId: string): RoomMcpState {
    const state = this.rooms.get(roomId);

    if (!state) {
      throw new RoomMcpError(-32602, `Room not found: ${roomId}`);
    }

    return state;
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

export function createRoomMcpServer(options: RoomMcpServerOptions = {}): RoomMcpServer {
  return new RoomMcpServer(options);
}

export function createInitialRoomMcpState(input: {
  roomId?: string;
  title?: string;
  now?: string;
  metadata?: Record<string, unknown>;
} = {}): RoomMcpState {
  const now = input.now ?? "2026-06-16T00:00:00.000Z";
  const roomId = input.roomId ?? "room-1";

  return {
    room: {
      id: roomId,
      title: input.title ?? "Phase 8 Room",
      status: "LIVE",
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {}
    },
    participants: [
      roomParticipantSummarySchema.parse({
        id: "participant-host",
        roomId,
        userId: "user-host",
        agentId: null,
        role: "HOST",
        displayName: "Host",
        joinedAt: now,
        leftAt: null
      })
    ],
    transcript: [
      roomTranscriptSegmentSchema.parse({
        id: "segment-1",
        roomId,
        speakerUserId: "user-host",
        speakerAgentId: null,
        text: "Jean, prepare la phase 8 Room MCP.",
        startedAt: now,
        endedAt: now,
        createdAt: now
      })
    ],
    tasks: [],
    artifacts: [],
    taskLogs: [],
    events: [],
    agents: [],
    agentRuns: [],
    approvals: [],
    sandboxSessions: []
  };
}

export function createMockRoomMcpClient(server: RoomMcpServer): {
  listTools: () => McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>;
  readContext: (roomId: string) => McpResourceReadResult;
} {
  return {
    listTools() {
      return server.listTools();
    },
    callTool(name, args) {
      return server.callTool(name, args);
    },
    readContext(roomId) {
      return server.readResource(`room://${roomId}/context`);
    }
  };
}

function resourceTemplate(uriTemplate: string, name: string, description: string): McpResourceTemplate {
  return {
    uriTemplate,
    name,
    description,
    mimeType: "application/json"
  };
}

function prompt(name: string, title: string, description: string, requiredArgs: string[]): McpPromptDefinition {
  return {
    name,
    title,
    description,
    arguments: requiredArgs.map((arg) => ({
      name: arg,
      description: `${arg} value.`,
      required: true
    }))
  };
}

function createLocalMockPreviewProvider(): RoomPreviewProvider {
  return {
    async createSession(input) {
      return {
        providerSessionId: `${input.provider.toLowerCase()}-${input.roomId}`,
        workdir: input.workdir
      };
    },
    async writeFiles() {
      return undefined;
    },
    async startServer() {
      return undefined;
    },
    async publishUrl(input) {
      return `https://preview.local/${input.providerSessionId ?? "session"}/${input.port}`;
    },
    async stopSession() {
      return undefined;
    }
  };
}

function validateJsonSchema(value: unknown, schema: McpJsonSchema, path: string): void {
  if (schema.enum && !schema.enum.includes(value as string | number | boolean | null)) {
    throw new RoomMcpError(-32602, `${path} must be one of: ${schema.enum.join(", ")}`);
  }

  if (schema.type === "object") {
    if (!isRecord(value)) {
      throw new RoomMcpError(-32602, `${path} must be an object.`);
    }

    for (const required of schema.required ?? []) {
      if (value[required] === undefined || value[required] === null) {
        throw new RoomMcpError(-32602, `${path}.${required} is required.`);
      }
    }

    const properties = schema.properties ?? {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[key];

      if (!propertySchema) {
        if (schema.additionalProperties === false) {
          throw new RoomMcpError(-32602, `${path}.${key} is not allowed.`);
        }
        continue;
      }

      if (propertyValue !== undefined && propertyValue !== null) {
        validateJsonSchema(propertyValue, propertySchema, `${path}.${key}`);
      }
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      throw new RoomMcpError(-32602, `${path} must be an array.`);
    }
    for (const [index, item] of value.entries()) {
      if (schema.items) {
        validateJsonSchema(item, schema.items, `${path}[${index}]`);
      }
    }
    return;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      throw new RoomMcpError(-32602, `${path} must be a string.`);
    }
    if (schema.minLength && value.length < schema.minLength) {
      throw new RoomMcpError(-32602, `${path} must not be empty.`);
    }
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        throw new RoomMcpError(-32602, `${path} must be a valid URI.`);
      }
    }
    return;
  }

  if (schema.type === "number" && typeof value !== "number") {
    throw new RoomMcpError(-32602, `${path} must be a number.`);
  }

  if (schema.type === "boolean" && typeof value !== "boolean") {
    throw new RoomMcpError(-32602, `${path} must be a boolean.`);
  }
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

function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
}

function cloneState(state: RoomMcpState): RoomMcpState {
  return structuredClone(state) as RoomMcpState;
}

function takeLast<T>(items: T[], limit?: number): T[] {
  if (!limit || limit >= items.length) {
    return items;
  }

  return items.slice(items.length - limit);
}

function replaceById<T extends { id: string }>(items: T[], item: T): void {
  const index = items.findIndex((candidate) => candidate.id === item.id);

  if (index === -1) {
    throw new RoomMcpError(-32602, `Record not found: ${item.id}`);
  }

  items[index] = item;
}

function requiredString(value: unknown): string {
  return assertString(value, "argument");
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RoomMcpError(-32602, `${path} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return assertString(value, "argument");
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw new RoomMcpError(-32602, "argument must be a number.");
  }

  return value;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return requiredNumber(value);
}

function requiredArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new RoomMcpError(-32602, `${path} must be an array.`);
  }

  return value;
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RoomMcpError(-32602, `${path} must be an object.`);
  }

  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  return requiredRecord(value, "argument");
}

function assertRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RoomMcpError(-32602, `${path} must be an object.`);
  }

  return value;
}

function assertOptionalRecord(value: unknown, path: string): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  return assertRecord(value, path);
}

function requiredFiles(value: unknown): PreviewFile[] {
  const files = requiredArray(value, "files");

  return files.map((file) => {
    const record = requiredRecord(file, "file");

    return {
      path: requiredString(record.path),
      content: requiredString(record.content)
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
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

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Room MCP error.";
}
