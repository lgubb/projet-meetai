import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialRoomMcpState,
  createMockRoomMcpClient,
  createRoomMcpServer,
  roomMcpPrompts,
  roomMcpResourceTemplates,
  roomMcpTools,
  type McpToolResult,
  type PreviewFile,
  type RoomPreviewProvider
} from "./index.js";

const expectedTools = [
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
  "preview.create_session",
  "preview.write_files",
  "preview.start_server",
  "preview.publish_url",
  "preview.stop_session",
  "agent.register",
  "agent.heartbeat",
  "agent.list",
  "agent.claim_task",
  "agent.start_run",
  "agent.emit_event",
  "agent.finish_run",
  "approval.request",
  "approval.get_status",
  "room.request_user_input",
  "room.speak"
];

test("room MCP exposes the official Phase 8 catalogue", async () => {
  const server = createRoomMcpServer();
  const initializeResponse = await server.handleJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize"
  });

  assert.deepEqual(
    roomMcpTools.map((tool) => tool.name),
    expectedTools
  );
  assert.equal(roomMcpResourceTemplates.length, 9);
  assert.deepEqual(
    roomMcpPrompts.map((prompt) => prompt.name),
    [
      "workroom.plan_task",
      "workroom.research_brief",
      "workroom.code_preview",
      "workroom.deck_outline",
      "workroom.review_artifact",
      "workroom.request_approval"
    ]
  );
  assert.match(JSON.stringify(initializeResponse), /2025-06-18/);
  assert.match(JSON.stringify(server.listTools()[0]?.inputSchema), /roomId/);
});

test("mock MCP client can drive the room agent flow end to end", async () => {
  const providerCalls: string[] = [];
  const sandboxProvider: RoomPreviewProvider = {
    async createSession(input) {
      providerCalls.push(`create:${input.provider}`);
      return {
        providerSessionId: "sandbox-provider-1"
      };
    },
    async writeFiles(input) {
      providerCalls.push(`write:${input.files.map((file) => file.path).join(",")}`);
    },
    async startServer(input) {
      providerCalls.push(`start:${input.command}:${input.port}`);
    },
    async publishUrl(input) {
      providerCalls.push(`publish:${input.port}`);
      return `https://preview.example/${input.port}`;
    },
    async stopSession() {
      providerCalls.push("stop");
    }
  };
  let tick = 0;
  const server = createRoomMcpServer({
    rooms: [
      createInitialRoomMcpState({
        metadata: {
          publicLabel: "visible",
          openaiApiKey: "sk-secret"
        }
      })
    ],
    sandboxProvider,
    now: () => new Date(Date.UTC(2026, 5, 16, 12, 0, tick++))
  });
  const client = createMockRoomMcpClient(server);

  const context = client.readContext("room-1");
  assert.match(context.contents[0]?.text ?? "", /contextPack/);

  const register = await client.callTool("agent.register", {
    roomId: "room-1",
    name: "Mock Codex",
    provider: "CODEX",
    transport: "HTTP",
    capabilities: ["CODE_GENERATION", "PROTOTYPING"],
    metadata: {
      bearerToken: "secret-token",
      safe: "ok"
    }
  });
  const agentId = readNestedString(register, "agent", "id");

  const createdTask = await client.callTool("room.create_task", {
    roomId: "room-1",
    agentId,
    title: "Build preview",
    description: "Create a sandboxed preview",
    riskLevel: "LOW"
  });
  const taskId = readNestedString(createdTask, "task", "id");

  await client.callTool("agent.claim_task", {
    roomId: "room-1",
    agentId,
    taskId
  });
  await client.callTool("room.append_log", {
    roomId: "room-1",
    taskId,
    message: "Writing preview files"
  });

  const artifactResult = await client.callTool("room.create_artifact", {
    roomId: "room-1",
    taskId,
    agentId,
    type: "PREVIEW",
    title: "Preview",
    content: {
      text: "Initial preview"
    }
  });
  const artifactId = readNestedString(artifactResult, "artifact", "id");

  const sessionResult = await client.callTool("preview.create_session", {
    roomId: "room-1",
    taskId,
    agentId,
    provider: "E2B"
  });
  const sessionId = readNestedString(sessionResult, "session", "id");
  const files: PreviewFile[] = [
    {
      path: "index.html",
      content: "<h1>Preview</h1>"
    }
  ];

  await client.callTool("preview.write_files", {
    roomId: "room-1",
    sessionId,
    files
  });
  await client.callTool("preview.start_server", {
    roomId: "room-1",
    sessionId,
    command: "python3 -m http.server 3000",
    port: 3000
  });
  await client.callTool("preview.publish_url", {
    roomId: "room-1",
    sessionId,
    artifactId,
    port: 3000
  });
  const approval = await client.callTool("approval.request", {
    roomId: "room-1",
    agentId,
    taskId,
    artifactId,
    riskLevel: "MEDIUM",
    action: "publish_preview",
    reason: "Expose a sandbox URL to room participants",
    payload: {
      previewUrl: "https://preview.example/3000"
    }
  });

  assert.equal(readNestedString(approval, "approval", "status"), "PENDING");
  assert.deepEqual(providerCalls, [
    "create:E2B",
    "write:index.html",
    "start:python3 -m http.server 3000:3000",
    "publish:3000"
  ]);

  const eventsResult = await client.callTool("room.list_events", {
    roomId: "room-1"
  });
  const eventTypes = readArray(eventsResult, "events").map((event) => readString(event, "type"));
  assert.ok(eventTypes.includes("AGENT_REGISTERED"));
  assert.ok(eventTypes.includes("TASK_CREATED"));
  assert.ok(eventTypes.includes("TASK_LOG_APPENDED"));
  assert.ok(eventTypes.includes("ARTIFACT_CREATED"));
  assert.ok(eventTypes.includes("SANDBOX_PREVIEW_PUBLISHED"));
  assert.ok(eventTypes.includes("APPROVAL_REQUESTED"));

  const roomState = await client.callTool("room.get_room_state", {
    roomId: "room-1"
  });
  const serializedState = JSON.stringify(roomState.structuredContent);
  assert.match(serializedState, /publicLabel/);
  assert.doesNotMatch(serializedState, /sk-secret|secret-token|openaiApiKey|bearerToken/);

  const artifactResource = server.readResource(`room://room-1/artifacts/${artifactId}`);
  assert.match(artifactResource.contents[0]?.text ?? "", /https:\/\/preview\.example\/3000/);
});

test("tool schemas reject invalid payloads", async () => {
  const server = createRoomMcpServer();

  await assert.rejects(
    () =>
      server.callTool("room.create_task", {
        roomId: "room-1"
      }),
    /arguments.title is required/
  );
  await assert.rejects(
    () =>
      server.callTool("room.create_task", {
        roomId: "room-1",
        title: "Valid",
        unexpected: true
      }),
    /arguments.unexpected is not allowed/
  );
  await assert.rejects(
    () =>
      server.callTool("room.set_preview_url", {
        roomId: "room-1",
        artifactId: "artifact-1",
        previewUrl: "not-a-url"
      }),
    /arguments.previewUrl must be a valid URI/
  );
});

test("JSON-RPC mock supports MCP list, call, resources, and prompts", async () => {
  const server = createRoomMcpServer();
  const toolsList = await server.handleJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  });
  const taskCreate = await server.handleJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "room.create_task",
      arguments: {
        roomId: "room-1",
        title: "JSON-RPC task"
      }
    }
  });
  const resourceRead = await server.handleJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: {
      uri: "room://room-1/tasks"
    }
  });
  const promptGet = await server.handleJsonRpc({
    jsonrpc: "2.0",
    id: 4,
    method: "prompts/get",
    params: {
      name: "workroom.plan_task",
      arguments: {
        roomId: "room-1"
      }
    }
  });

  assert.match(JSON.stringify(toolsList), /room.get_context_pack/);
  assert.match(JSON.stringify(taskCreate), /JSON-RPC task/);
  assert.match(JSON.stringify(resourceRead), /JSON-RPC task/);
  assert.match(JSON.stringify(promptGet), /room.get_context_pack/);
});

function readNestedString(result: McpToolResult, key: string, nestedKey: string): string {
  return readString(readRecord(result.structuredContent, key), nestedKey);
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);

  return value as Record<string, unknown>;
}

function readArray(result: McpToolResult, key: string): Array<Record<string, unknown>> {
  const value = result.structuredContent[key];
  assert.ok(Array.isArray(value));

  return value as Array<Record<string, unknown>>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  assert.equal(typeof value, "string");

  return value as string;
}
