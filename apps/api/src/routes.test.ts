import assert from "node:assert/strict";
import test from "node:test";

import type { ApiDatabase } from "./db.js";
import { createE2BConnector, type SandboxProvider } from "./e2b-connector.js";
import type { LiveKitTokenIssuer, LiveKitTokenRequest } from "./livekit.js";
import { buildServer } from "./server.js";

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeOrganization = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type FakeOrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: Date;
  updatedAt: Date;
};

type FakeRoom = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string;
  status: "CREATED" | "LIVE" | "ENDED" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
};

type FakeRoomParticipant = {
  id: string;
  roomId: string;
  userId: string | null;
  agentId: string | null;
  role: "HOST" | "MEMBER" | "GUEST" | "OBSERVER" | "AGENT";
  joinedAt: Date;
  leftAt: Date | null;
};

type FakeTranscriptSegment = {
  id: string;
  roomId: string;
  speakerUserId: string | null;
  speakerAgentId: string | null;
  text: string;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
};

type FakeAgent = {
  id: string;
  organizationId: string;
  name: string;
  provider: "NATIVE" | "MCP" | "CODEX" | "LOVABLE" | "PERPLEXITY" | "E2B";
  capabilities: Array<"ORCHESTRATION" | "RESEARCH" | "CODE_GENERATION" | "PROTOTYPING" | "TASK_PLANNING" | "ARTIFACT_GENERATION">;
  createdAt: Date;
  updatedAt: Date;
};

type FakeAgentConnection = {
  id: string;
  agentId: string;
  transport: "IN_PROCESS" | "HTTP" | "STDIO";
  endpoint: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeTask = {
  id: string;
  roomId: string;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  assignedAgentId: string | null;
  title: string;
  description: string | null;
  status: "PENDING" | "RUNNING" | "WAITING_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type FakeTaskEvent = {
  id: string;
  roomId: string;
  taskId: string;
  type: string;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
};

type FakeArtifact = {
  id: string;
  roomId: string;
  taskId: string | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  type: "DOCUMENT" | "CODE" | "RESEARCH" | "DIAGRAM" | "PREVIEW" | "LOG";
  status: "DRAFT" | "GENERATING" | "READY" | "FAILED" | "ARCHIVED";
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type FakeArtifactVersion = {
  id: string;
  artifactId: string;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  version: number;
  content: Record<string, unknown>;
  createdAt: Date;
};

type FakeApproval = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string | null;
  requestedByUserId: string | null;
  requestedByAgentId: string | null;
  decidedByUserId: string | null;
  title: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: Date;
  decidedAt: Date | null;
};

type FakeAuditLog = {
  id: string;
  organizationId: string | null;
  roomId: string | null;
  actorUserId: string | null;
  actorAgentId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

type FakeApiDatabase = ApiDatabase & {
  agentConnectionRecords: FakeAgentConnection[];
  agentRecords: FakeAgent[];
  approvalRecords: FakeApproval[];
  auditLogRecords: FakeAuditLog[];
  artifactRecords: FakeArtifact[];
  artifactVersionRecords: FakeArtifactVersion[];
  taskEventRecords: FakeTaskEvent[];
  taskRecords: FakeTask[];
  transcriptSegmentRecords: FakeTranscriptSegment[];
};

test("organization and room routes require auth", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const response = await server.inject({
    method: "GET",
    url: "/organizations"
  });

  assert.equal(response.statusCode, 401);

  await server.close();
});

test("organization and room routes support a minimal phase 1 flow", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });

  assert.equal(organizationResponse.statusCode, 201);
  const organizationBody = organizationResponse.json<{ organization: { id: string; name: string } }>();
  assert.equal(organizationBody.organization.name, "Acme");

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });

  assert.equal(roomResponse.statusCode, 201);
  const roomBody = roomResponse.json<{ room: { id: string; title: string } }>();
  assert.equal(roomBody.room.title, "Planning");

  const ownerRoomResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders
  });

  assert.equal(ownerRoomResponse.statusCode, 200);
  const ownerRoomBody = ownerRoomResponse.json<{
    participants: Array<{ role: string; userEmail: string | null; userName: string | null }>;
  }>();
  assert.deepEqual(
    ownerRoomBody.participants.map((participant) => participant.role),
    ["HOST"]
  );
  assert.deepEqual(
    ownerRoomBody.participants.map((participant) => [participant.userName, participant.userEmail]),
    [["Owner", "owner@example.com"]]
  );

  const memberJoinResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/join`,
    headers: {
      "x-dev-user-email": "member@example.com",
      "x-dev-user-name": "Member"
    }
  });

  assert.equal(memberJoinResponse.statusCode, 201);
  const memberJoinBody = memberJoinResponse.json<{ participant: { role: string } }>();
  assert.equal(memberJoinBody.participant.role, "MEMBER");

  const updateRoomResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders,
    payload: {
      title: "Renamed planning"
    }
  });

  assert.equal(updateRoomResponse.statusCode, 200);
  const updateRoomBody = updateRoomResponse.json<{ room: { title: string } }>();
  assert.equal(updateRoomBody.room.title, "Renamed planning");

  const deleteRoomResponse = await server.inject({
    method: "DELETE",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders
  });

  assert.equal(deleteRoomResponse.statusCode, 204);

  const deletedRoomResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders
  });

  assert.equal(deletedRoomResponse.statusCode, 404);

  await server.close();
});

test("room livekit token endpoint returns a room-scoped join token", async () => {
  const liveKitTokenIssuer = createFakeLiveKitTokenIssuer();
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer,
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const tokenResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/livekit-token`,
    headers: ownerHeaders,
    payload: {}
  });

  assert.equal(tokenResponse.statusCode, 200);
  const tokenBody = tokenResponse.json<{
    livekit: { serverUrl: string; token: string; roomName: string; identity: string };
  }>();
  assert.equal(tokenBody.livekit.serverUrl, "wss://livekit.example.test");
  assert.equal(tokenBody.livekit.token, `token:${roomBody.room.id}:user-1`);
  assert.equal(tokenBody.livekit.roomName, roomBody.room.id);
  assert.equal(tokenBody.livekit.identity, "user-1");
  assert.deepEqual(liveKitTokenIssuer.requests, [
    {
      roomId: roomBody.room.id,
      userId: "user-1",
      userName: "Owner"
    }
  ]);

  await server.close();
});

test("room livekit token endpoint rejects invalid payloads and inaccessible rooms", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const invalidPayloadResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/livekit-token`,
    headers: ownerHeaders,
    payload: {
      identity: "user-provided-identity"
    }
  });

  assert.equal(invalidPayloadResponse.statusCode, 400);

  const outsiderResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/livekit-token`,
    headers: {
      "x-dev-user-email": "outsider@example.com",
      "x-dev-user-name": "Outsider"
    },
    payload: {}
  });

  assert.equal(outsiderResponse.statusCode, 404);

  await server.close();
});

test("room event gateway persists and broadcasts final transcript events", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessage = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for room event.")), 1000);

    socket.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Hello room",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  const transcriptBody = transcriptResponse.json<{
    event: { segmentId: string; type: string; speakerId: string; text: string };
  }>();

  assert.equal(transcriptBody.event.segmentId, "transcript-1");
  assert.equal(db.transcriptSegmentRecords.length, 1);
  assert.equal(db.transcriptSegmentRecords[0]?.speakerUserId, "user-1");
  assert.equal(db.transcriptSegmentRecords[0]?.text, "Hello room");
  assert.deepEqual(await nextMessage, transcriptBody.event);

  socket.terminate();
  await server.close();
});

test("task route persists and broadcasts task artifact events", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{ type: string }>(socket, 2);

  const createTaskResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders,
    payload: {
      title: "Manual spec",
      artifact: {
        type: "DOCUMENT",
        content: {
          text: "Manual draft"
        }
      }
    }
  });

  assert.equal(createTaskResponse.statusCode, 201);
  const createTaskBody = createTaskResponse.json<{
    task: { id: string; title: string; createdByUserId: string | null };
    artifact: { id: string; taskId: string | null; latestVersion: { content: { text?: string } } | null };
  }>();

  assert.equal(createTaskBody.task.title, "Manual spec");
  assert.equal(createTaskBody.task.createdByUserId, "user-1");
  assert.equal(createTaskBody.artifact.taskId, createTaskBody.task.id);
  assert.equal(createTaskBody.artifact.latestVersion?.content.text, "Manual draft");
  assert.equal(db.taskRecords.length, 1);
  assert.equal(db.artifactRecords.length, 1);
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    ["task.created", "artifact.created"]
  );

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    ["task.created", "artifact.created"]
  );

  const listTasksResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders
  });

  assert.equal(listTasksResponse.statusCode, 200);
  const listTasksBody = listTasksResponse.json<{ items: Array<{ task: { id: string }; artifacts: unknown[] }> }>();
  assert.equal(listTasksBody.items.length, 1);
  assert.equal(listTasksBody.items[0]?.task.id, createTaskBody.task.id);
  assert.equal(listTasksBody.items[0]?.artifacts.length, 1);

  socket.terminate();
  await server.close();
});

test("task lifecycle streams logs, patches artifacts, and replays persisted events", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    eventId?: string;
    type: string;
    artifact?: { id: string; latestVersion: { content: Record<string, unknown> } | null };
    log?: { message: string };
    task?: { status: string };
  }>(socket, 8);

  const createTaskResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders,
    payload: {
      title: "Live code",
      artifact: {
        type: "CODE",
        content: {
          files: [
            {
              path: "index.ts",
              content: "console.log('draft');"
            }
          ]
        }
      }
    }
  });

  assert.equal(createTaskResponse.statusCode, 201);
  const createTaskBody = createTaskResponse.json<{
    task: { id: string; status: string };
    artifact: { id: string; latestVersion: { content: Record<string, unknown> } | null };
  }>();
  assert.equal(createTaskBody.task.status, "PENDING");

  const runningResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/tasks/${createTaskBody.task.id}/status`,
    headers: ownerHeaders,
    payload: {
      status: "RUNNING"
    }
  });

  assert.equal(runningResponse.statusCode, 200);

  const logResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks/${createTaskBody.task.id}/logs`,
    headers: ownerHeaders,
    payload: {
      message: "Generating files"
    }
  });

  assert.equal(logResponse.statusCode, 201);

  const patchResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}/patches`,
    headers: ownerHeaders,
    payload: {
      patch: {
        text: "Patched live",
        files: [
          {
            path: "index.ts",
            content: "console.log('patched');"
          }
        ]
      }
    }
  });

  assert.equal(patchResponse.statusCode, 201);

  const updateArtifactResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}`,
    headers: ownerHeaders,
    payload: {
      title: "Live code ready",
      status: "READY",
      content: {
        text: "Ready",
        files: [
          {
            path: "index.ts",
            content: "console.log('ready');"
          }
        ]
      }
    }
  });

  assert.equal(updateArtifactResponse.statusCode, 200);

  const previewResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}/preview-url`,
    headers: ownerHeaders,
    payload: {
      previewUrl: "https://example.com/preview"
    }
  });

  assert.equal(previewResponse.statusCode, 200);

  const completedResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/tasks/${createTaskBody.task.id}/status`,
    headers: ownerHeaders,
    payload: {
      status: "COMPLETED"
    }
  });

  assert.equal(completedResponse.statusCode, 200);

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "task.created",
      "artifact.created",
      "task.status",
      "task.log",
      "artifact.patch",
      "artifact.updated",
      "artifact.preview_url",
      "task.status"
    ]
  );
  assert.equal(messages[2]?.task?.status, "RUNNING");
  assert.equal(messages[3]?.log?.message, "Generating files");
  assert.equal(messages[7]?.task?.status, "COMPLETED");
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.ok(db.taskRecords[0]?.completedAt);
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    [
      "task.created",
      "artifact.created",
      "task.status",
      "task.log",
      "artifact.patch",
      "artifact.updated",
      "artifact.preview_url",
      "task.status"
    ]
  );
  assert.equal(db.artifactVersionRecords.length, 4);
  assert.equal(db.artifactVersionRecords[3]?.content.previewUrl, "https://example.com/preview");

  const listTasksResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders
  });

  assert.equal(listTasksResponse.statusCode, 200);
  const listTasksBody = listTasksResponse.json<{
    items: Array<{ task: { status: string }; artifacts: Array<{ title: string }>; logs: Array<{ message: string }> }>;
  }>();
  assert.equal(listTasksBody.items[0]?.task.status, "COMPLETED");
  assert.equal(listTasksBody.items[0]?.artifacts[0]?.title, "Live code ready");
  assert.deepEqual(
    listTasksBody.items[0]?.logs.map((log) => log.message),
    ["Generating files"]
  );

  const replayResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/events/replay?afterEventId=${messages[1]?.eventId}`,
    headers: ownerHeaders
  });

  assert.equal(replayResponse.statusCode, 200);
  const replayBody = replayResponse.json<{ events: Array<{ type: string }> }>();
  assert.deepEqual(
    replayBody.events.map((event) => event.type),
    ["task.status", "task.log", "artifact.patch", "artifact.updated", "artifact.preview_url", "task.status"]
  );

  socket.terminate();
  await server.close();
});

test("room MCP HTTP token lets an external agent work in a real room", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "MCP room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{ type: string; event?: { type: string } }>(socket, 9);

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Remote MCP Agent",
      provider: "MCP",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    }
  });

  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string; name: string };
    session: { token: string; tokenType: string };
  }>();
  assert.equal(sessionBody.agent.name, "Remote MCP Agent");
  assert.equal(sessionBody.session.tokenType, "Bearer");

  const context = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.get_context_pack", {
    roomId: roomBody.room.id
  });
  assert.equal(readRecord(context, "contextPack").roomId, roomBody.room.id);

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.register", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    name: "Remote MCP Agent",
    provider: "MCP",
    transport: "HTTP",
    capabilities: ["CODE_GENERATION", "PROTOTYPING"]
  });

  const createdTask = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_task", {
    roomId: roomBody.room.id,
    title: "Build preview",
    description: "Create a sandboxed preview",
    riskLevel: "LOW"
  });
  const taskId = readString(readRecord(createdTask, "task"), "id");

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.claim_task", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId
  });
  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.append_log", {
    roomId: roomBody.room.id,
    taskId,
    message: "Writing preview files"
  });

  const artifactResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_artifact", {
    roomId: roomBody.room.id,
    taskId,
    type: "PREVIEW",
    title: "Preview",
    content: {
      text: "Preview draft"
    }
  });
  const artifactId = readString(readRecord(artifactResult, "artifact"), "id");

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.set_preview_url", {
    roomId: roomBody.room.id,
    artifactId,
    previewUrl: "https://preview.example/remote-mcp"
  });

  const approvalResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "approval.request", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId,
    artifactId,
    riskLevel: "MEDIUM",
    action: "publish_preview",
    reason: "Expose sandbox URL to room participants",
    payload: {
      previewUrl: "https://preview.example/remote-mcp"
    }
  });
  const approvalId = readString(readRecord(approvalResult, "approval"), "id");

  const messages = await nextMessages;
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "AGENT_REGISTERED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "APPROVAL_REQUESTED"));
  assert.ok(messages.some((message) => message.type === "artifact.preview_url"));

  const eventsResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.list_events", {
    roomId: roomBody.room.id
  });
  const eventTypes = readArray(eventsResult, "events").map((event) => readString(event, "type"));
  assert.ok(eventTypes.includes("AGENT_REGISTERED"));
  assert.ok(eventTypes.includes("TASK_CREATED"));
  assert.ok(eventTypes.includes("TASK_LOG_APPENDED"));
  assert.ok(eventTypes.includes("ARTIFACT_CREATED"));
  assert.ok(eventTypes.includes("ARTIFACT_PREVIEW_SET"));
  assert.ok(eventTypes.includes("APPROVAL_REQUESTED"));

  const replayResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/events/replay`,
    headers: ownerHeaders
  });
  assert.equal(replayResponse.statusCode, 200);
  const replayBody = replayResponse.json<{ events: Array<{ type: string; event?: { type: string } }> }>();
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "AGENT_REGISTERED"));
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "APPROVAL_REQUESTED"));

  const agentListResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/agents`,
    headers: ownerHeaders
  });
  assert.equal(agentListResponse.statusCode, 200);
  const agentListBody = agentListResponse.json<{ agents: Array<{ id: string; name: string }> }>();
  assert.deepEqual(
    agentListBody.agents.map((agent) => [agent.id, agent.name]),
    [[sessionBody.agent.id, "Remote MCP Agent"]]
  );

  const approvalListResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/approvals`,
    headers: ownerHeaders
  });
  assert.equal(approvalListResponse.statusCode, 200);
  const approvalListBody = approvalListResponse.json<{ approvals: Array<{ id: string; status: string; action: string }> }>();
  assert.deepEqual(
    approvalListBody.approvals.map((approval) => ({
      id: approval.id,
      status: approval.status,
      action: approval.action
    })),
    [
    {
      id: approvalId,
      status: "PENDING",
      action: "publish_preview"
    }
    ]
  );

  const decisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${approvalId}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(decisionResponse.statusCode, 200);
  assert.equal(decisionResponse.json<{ approval: { status: string } }>().approval.status, "APPROVED");

  const repeatedDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${approvalId}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "REJECTED"
    }
  });
  assert.equal(repeatedDecisionResponse.statusCode, 409);

  const impersonationResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "impersonation",
    method: "tools/call",
    params: {
      name: "agent.claim_task",
      arguments: {
        roomId: roomBody.room.id,
        agentId: "agent-other",
        taskId
      }
    }
  });
  assert.equal(impersonationResponse.status, 200);
  assert.equal((await impersonationResponse.json() as { error: { code: number } }).error.code, -32001);

  const missingTokenResponse = await fetch(`${baseUrl}/rooms/${roomBody.room.id}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "missing-token",
      method: "tools/list"
    })
  });
  assert.equal(missingTokenResponse.status, 401);

  db.agentConnectionRecords.splice(0);
  const missingSessionResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "missing-session",
    method: "tools/call",
    params: {
      name: "room.list_events",
      arguments: {
        roomId: roomBody.room.id
      }
    }
  });
  assert.equal(missingSessionResponse.status, 200);
  assert.equal(((await missingSessionResponse.json()) as { error: { code: number } }).error.code, -32001);

  assert.equal(db.taskRecords[0]?.assignedAgentId, sessionBody.agent.id);
  assert.equal(db.artifactVersionRecords.at(-1)?.content.previewUrl, "https://preview.example/remote-mcp");
  assert.equal(db.approvalRecords[0]?.status, "APPROVED");

  socket.terminate();
  await server.close();
});

test("Jean creates a task artifact bundle from addressed final transcripts", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    eventId?: string;
    type: string;
    artifact?: { latestVersion: { content: Record<string, unknown> } | null };
    log?: { message: string };
    task?: { status: string; title: string };
    text?: string;
  }>(socket, 10);

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, crée une spec",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  assert.equal(db.agentRecords.length, 1);
  assert.equal(db.agentRecords[0]?.name, "Jean");
  assert.equal(db.taskRecords.length, 1);
  assert.equal(db.taskRecords[0]?.title, "Spec");
  assert.equal(db.taskRecords[0]?.createdByAgentId, "agent-1");
  assert.equal(db.artifactRecords.length, 1);
  assert.equal(db.artifactRecords[0]?.type, "DOCUMENT");
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    [
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "task.status"
    ]
  );
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.equal(db.artifactVersionRecords.length, 2);
  assert.equal(typeof db.artifactVersionRecords[1]?.content.text, "string");
  assert.ok(Array.isArray(db.artifactVersionRecords[1]?.content.sections));

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "transcript.final",
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "task.status"
    ]
  );
  assert.equal(messages[1]?.task?.title, "Spec");
  assert.equal(messages[3]?.text, "Oui, je crée une spec.");
  assert.equal(messages[4]?.task?.status, "RUNNING");
  assert.equal(messages[5]?.log?.message, "Préparation du contexte de la tâche.");
  assert.equal(messages[9]?.task?.status, "COMPLETED");

  const replayResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/events/replay?afterEventId=${messages[2]?.eventId}`,
    headers: ownerHeaders
  });

  assert.equal(replayResponse.statusCode, 200);
  const replayBody = replayResponse.json<{ events: Array<{ type: string }> }>();
  assert.deepEqual(
    replayBody.events.map((event) => event.type),
    ["agent.speech", "task.status", "task.log", "task.log", "artifact.patch", "task.log", "task.status"]
  );

  socket.terminate();
  await server.close();
});

test("Jean local runner fills research artifacts with mock sources", async () => {
  const previousPerplexityApiKey = process.env.PERPLEXITY_API_KEY;

  delete process.env.PERPLEXITY_API_KEY;

  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Research room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    type: string;
    artifact?: { type: string; latestVersion: { content: Record<string, unknown> } | null };
    task?: { status: string; title: string };
  }>(socket, 10);

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, fais une recherche sur LiveKit",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  assert.equal(db.taskRecords[0]?.title, "Research: LiveKit");
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.equal(db.artifactRecords[0]?.type, "RESEARCH");
  assert.equal(db.artifactVersionRecords.length, 2);
  assert.equal(db.artifactVersionRecords[1]?.content.summary, "Synthèse locale provisoire sur LiveKit.");
  assert.ok(Array.isArray(db.artifactVersionRecords[1]?.content.sources));

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "transcript.final",
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "task.status"
    ]
  );
  assert.equal(messages[2]?.artifact?.type, "RESEARCH");
  assert.equal(messages[7]?.artifact?.latestVersion?.content.summary, "Synthèse locale provisoire sur LiveKit.");
  assert.equal(messages[9]?.task?.status, "COMPLETED");

  socket.terminate();
  await server.close();

  if (previousPerplexityApiKey) {
    process.env.PERPLEXITY_API_KEY = previousPerplexityApiKey;
  }
});

test("Jean routes prototype tasks to E2B and publishes a preview URL", async () => {
  const providerInputs: Array<{ objective: string; title: string }> = [];
  const fakeE2BProvider: SandboxProvider = {
    async *runPrototype(input) {
      providerInputs.push(input);

      yield {
        type: "log",
        message: "Sandbox E2B prêt: sandbox-test."
      };
      yield {
        type: "artifact.patch",
        patch: {
          provider: "e2b",
          sandboxId: "sandbox-test",
          text: `Preview E2B générée pour: ${input.objective}.`,
          files: [
            {
              path: "index.html",
              content: "<!doctype html><div id=\"root\">Preview</div>"
            }
          ]
        }
      };
      yield {
        type: "log",
        message: "Serveur de preview E2B lancé."
      };
      yield {
        type: "artifact.preview_url",
        previewUrl: "https://3000-sandbox-test.e2b.app"
      };
    }
  };
  const e2bConnector = createE2BConnector({
    provider: fakeE2BProvider
  });

  assert.ok(e2bConnector);

  const db = createFakeDb();
  const server = buildServer({
    agentConnectors: [e2bConnector],
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Prototype room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    type: string;
    artifact?: { type: string; latestVersion: { content: Record<string, unknown> } | null };
    log?: { message: string };
    previewUrl?: string;
    task?: { status: string; title: string };
  }>(socket, 11);

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, crée une preview HTML de dashboard",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  assert.deepEqual(providerInputs, [
    {
      objective: "crée une preview HTML de dashboard",
      title: "Prototype"
    }
  ]);
  assert.equal(db.taskRecords[0]?.title, "Prototype");
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.equal(db.artifactRecords[0]?.type, "PREVIEW");
  assert.equal(db.artifactVersionRecords.length, 3);
  assert.equal(db.artifactVersionRecords[1]?.content.provider, "e2b");
  assert.equal(db.artifactVersionRecords[2]?.content.previewUrl, "https://3000-sandbox-test.e2b.app");

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "transcript.final",
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "artifact.preview_url",
      "task.status"
    ]
  );
  assert.equal(messages[2]?.artifact?.type, "PREVIEW");
  assert.equal(messages[5]?.log?.message, "Préparation de la preview E2B.");
  assert.equal(messages[7]?.artifact?.latestVersion?.content.provider, "e2b");
  assert.equal(messages[9]?.previewUrl, "https://3000-sandbox-test.e2b.app");
  assert.equal(messages[10]?.task?.status, "COMPLETED");

  socket.terminate();
  await server.close();
});

test("Jean routes research tasks to Perplexity when an API key is configured", async () => {
  const previousFetch = globalThis.fetch;
  const previousPerplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const previousPerplexityModel = process.env.PERPLEXITY_MODEL;
  const requests: Array<{ url: string; body: unknown }> = [];

  process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
  process.env.PERPLEXITY_MODEL = "sonar-pro";
  globalThis.fetch = (async (url, init) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "LiveKit est une plateforme temps réel pour audio, vidéo et données.\n\nElle est utilisée pour construire des expériences de communication live."
            }
          }
        ],
        search_results: [
          {
            title: "LiveKit Docs",
            url: "https://docs.livekit.io/",
            snippet: "LiveKit documentation."
          }
        ],
        citations: ["https://docs.livekit.io/"]
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  try {
    const ownerHeaders = {
      "x-dev-user-email": "owner@example.com",
      "x-dev-user-name": "Owner"
    };

    const organizationResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      headers: ownerHeaders,
      payload: {
        name: "Acme"
      }
    });
    const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

    const roomResponse = await server.inject({
      method: "POST",
      url: `/organizations/${organizationBody.organization.id}/rooms`,
      headers: ownerHeaders,
      payload: {
        title: "Perplexity room"
      }
    });
    const roomBody = roomResponse.json<{ room: { id: string } }>();

    await server.ready();

    const socket = await server.injectWS(
      `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
    );
    const nextMessages = readSocketMessages<{
      type: string;
      artifact?: { latestVersion: { content: Record<string, unknown> } | null };
      log?: { message: string };
      task?: { status: string };
    }>(socket, 9);

    const transcriptResponse = await server.inject({
      method: "POST",
      url: `/internal/rooms/${roomBody.room.id}/events`,
      headers: {
        authorization: "Bearer worker-secret"
      },
      payload: {
        type: "transcript.final",
        roomId: roomBody.room.id,
        speakerId: "user-1",
        text: "Jean, fais une recherche sur LiveKit",
        ts: "2026-06-06T12:00:04.000Z",
        startedAt: "2026-06-06T12:00:01.000Z",
        endedAt: "2026-06-06T12:00:04.000Z"
      }
    });

    assert.equal(transcriptResponse.statusCode, 202);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.perplexity.ai/chat/completions");
    assert.equal(db.taskRecords[0]?.status, "COMPLETED");
    assert.equal(db.artifactRecords[0]?.type, "RESEARCH");
    assert.equal(db.artifactVersionRecords[1]?.content.provider, "perplexity");
    assert.equal(db.artifactVersionRecords[1]?.content.model, "sonar-pro");
    assert.deepEqual(db.artifactVersionRecords[1]?.content.sources, [
      {
        title: "LiveKit Docs",
        url: "https://docs.livekit.io/"
      }
    ]);

    const messages = await nextMessages;
    assert.deepEqual(
      messages.map((message) => message.type),
      [
        "transcript.final",
        "task.created",
        "artifact.created",
        "agent.speech",
        "task.status",
        "task.log",
        "task.log",
        "artifact.patch",
        "task.status"
      ]
    );
    assert.equal(messages[5]?.log?.message, "Recherche Perplexity en cours.");
    assert.equal(messages[7]?.artifact?.latestVersion?.content.provider, "perplexity");
    assert.equal(messages[8]?.task?.status, "COMPLETED");

    socket.terminate();
  } finally {
    await server.close();
    globalThis.fetch = previousFetch;

    if (previousPerplexityApiKey) {
      process.env.PERPLEXITY_API_KEY = previousPerplexityApiKey;
    } else {
      delete process.env.PERPLEXITY_API_KEY;
    }

    if (previousPerplexityModel) {
      process.env.PERPLEXITY_MODEL = previousPerplexityModel;
    } else {
      delete process.env.PERPLEXITY_MODEL;
    }
  }
});

test("room event ingestion rejects invalid events and invalid worker tokens", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const invalidTokenResponse = await server.inject({
    method: "POST",
    url: "/internal/rooms/room-1/events",
    headers: {
      authorization: "Bearer wrong-secret"
    },
    payload: {
      type: "transcript.partial",
      roomId: "room-1",
      speakerId: "user-1",
      text: "Hello",
      ts: "2026-06-06T12:00:00.000Z"
    }
  });

  assert.equal(invalidTokenResponse.statusCode, 401);

  const invalidEventResponse = await server.inject({
    method: "POST",
    url: "/internal/rooms/room-1/events",
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.partial",
      roomId: "room-2",
      speakerId: "user-1",
      text: "Hello",
      ts: "2026-06-06T12:00:00.000Z"
    }
  });

  assert.equal(invalidEventResponse.statusCode, 400);

  await server.close();
});

type FakeLiveKitTokenIssuer = LiveKitTokenIssuer & {
  requests: LiveKitTokenRequest[];
};

function createFakeLiveKitTokenIssuer(): FakeLiveKitTokenIssuer {
  const requests: LiveKitTokenRequest[] = [];

  return {
    serverUrl: "wss://livekit.example.test",
    requests,
    async issueRoomToken(request) {
      requests.push(request);

      return `token:${request.roomId}:${request.userId}`;
    }
  };
}

type TestWebSocket = {
  once(event: "message", listener: (data: { toString(): string }) => void): void;
};

function readSocketMessages<T extends Record<string, unknown>>(socket: TestWebSocket, count: number): Promise<T[]> {
  const messages: T[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for room events.")), 1000);
    const readNext = () => {
      socket.once("message", (data) => {
        messages.push(JSON.parse(data.toString()) as T);

        if (messages.length === count) {
          clearTimeout(timeout);
          resolve(messages);
          return;
        }

        readNext();
      });
    };

    readNext();
  });
}

async function callMcpHttpTool(
  baseUrl: string,
  roomId: string,
  token: string,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await postMcpHttp(baseUrl, roomId, token, {
    jsonrpc: "2.0",
    id: name,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result?: { structuredContent: Record<string, unknown> };
    error?: { message: string };
  };

  assert.equal(body.error, undefined);
  assert.ok(body.result);

  return body.result.structuredContent;
}

function postMcpHttp(baseUrl: string, roomId: string, token: string, payload: Record<string, unknown>) {
  return fetch(`${baseUrl}/rooms/${roomId}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);

  return value as Record<string, unknown>;
}

function readArray(record: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = record[key];
  assert.ok(Array.isArray(value));

  return value as Array<Record<string, unknown>>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  assert.equal(typeof value, "string");

  return value as string;
}

function createFakeDb(): FakeApiDatabase {
  const now = new Date("2026-06-06T12:00:00.000Z");
  const users: FakeUser[] = [];
  const organizations: FakeOrganization[] = [];
  const memberships: FakeOrganizationMember[] = [];
  const rooms: FakeRoom[] = [];
  const participants: FakeRoomParticipant[] = [];
  const agents: FakeAgent[] = [];
  const agentConnections: FakeAgentConnection[] = [];
  const tasks: FakeTask[] = [];
  const taskEvents: FakeTaskEvent[] = [];
  const artifacts: FakeArtifact[] = [];
  const artifactVersions: FakeArtifactVersion[] = [];
  const approvals: FakeApproval[] = [];
  const auditLogs: FakeAuditLog[] = [];
  const transcriptSegments: FakeTranscriptSegment[] = [];

  const db = {
    agent: {
      async findFirst(params: { where: { organizationId: string; name: string; provider: FakeAgent["provider"] } }) {
        return (
          agents.find(
            (agent) =>
              agent.organizationId === params.where.organizationId &&
              agent.name === params.where.name &&
              agent.provider === params.where.provider
          ) ?? null
        );
      },
      async create(params: {
        data: {
          organizationId: string;
          name: string;
          provider: FakeAgent["provider"];
          capabilities: FakeAgent["capabilities"];
        };
      }) {
        const agent: FakeAgent = {
          id: `agent-${agents.length + 1}`,
          organizationId: params.data.organizationId,
          name: params.data.name,
          provider: params.data.provider,
          capabilities: params.data.capabilities,
          createdAt: now,
          updatedAt: now
        };

        agents.push(agent);

        return agent;
      }
    },
    agentConnection: {
      async findFirst(params: { where: { id: string; agentId: string } }) {
        return (
          agentConnections.find(
            (connection) => connection.id === params.where.id && connection.agentId === params.where.agentId
          ) ?? null
        );
      },
      async create(params: {
        data: {
          agentId: string;
          transport: FakeAgentConnection["transport"];
          endpoint: string | null;
        };
      }) {
        const connection: FakeAgentConnection = {
          id: `agent-connection-${agentConnections.length + 1}`,
          agentId: params.data.agentId,
          transport: params.data.transport,
          endpoint: params.data.endpoint,
          createdAt: now,
          updatedAt: now
        };

        agentConnections.push(connection);

        return connection;
      }
    },
    user: {
      async upsert(params: {
        where: { email: string };
        create: { email: string; name: string | null };
        update: { name: string | null };
      }) {
        const existing = users.find((user) => user.email === params.where.email);

        if (existing) {
          existing.name = params.update.name;
          existing.updatedAt = now;
          return existing;
        }

        const user: FakeUser = {
          id: `user-${users.length + 1}`,
          email: params.create.email,
          name: params.create.name,
          createdAt: now,
          updatedAt: now
        };

        users.push(user);

        return user;
      }
    },
    organization: {
      async create(params: { data: { name: string; members: { create: { userId: string; role: "OWNER" } } } }) {
        const organization: FakeOrganization = {
          id: `org-${organizations.length + 1}`,
          name: params.data.name,
          createdAt: now,
          updatedAt: now
        };

        organizations.push(organization);
        memberships.push({
          id: `member-${memberships.length + 1}`,
          organizationId: organization.id,
          userId: params.data.members.create.userId,
          role: params.data.members.create.role,
          createdAt: now,
          updatedAt: now
        });

        return organization;
      },
      async findMany(params: { where: { members: { some: { userId: string } } }; orderBy: { createdAt: "desc" } }) {
        const userOrganizationIds = memberships
          .filter((membership) => membership.userId === params.where.members.some.userId)
          .map((membership) => membership.organizationId);

        return organizations.filter((organization) => userOrganizationIds.includes(organization.id));
      }
    },
    organizationMember: {
      async findUnique(params: { where: { organizationId_userId: { organizationId: string; userId: string } } }) {
        return (
          memberships.find(
            (membership) =>
              membership.organizationId === params.where.organizationId_userId.organizationId &&
              membership.userId === params.where.organizationId_userId.userId
          ) ?? null
        );
      },
      async upsert(params: {
        where: { organizationId_userId: { organizationId: string; userId: string } };
        create: { organizationId: string; userId: string; role: "MEMBER" };
        update: Record<string, never>;
      }) {
        const existing =
          memberships.find(
            (membership) =>
              membership.organizationId === params.where.organizationId_userId.organizationId &&
              membership.userId === params.where.organizationId_userId.userId
          ) ?? null;

        if (existing) {
          return existing;
        }

        const membership: FakeOrganizationMember = {
          id: `member-${memberships.length + 1}`,
          organizationId: params.create.organizationId,
          userId: params.create.userId,
          role: params.create.role,
          createdAt: now,
          updatedAt: now
        };

        memberships.push(membership);

        return membership;
      }
    },
    room: {
      async create(params: {
        data: {
          organizationId: string;
          createdByUserId: string;
          title: string;
          participants: { create: { userId: string; role: "HOST" } };
        };
      }) {
        const room: FakeRoom = {
          id: `room-${rooms.length + 1}`,
          organizationId: params.data.organizationId,
          createdByUserId: params.data.createdByUserId,
          title: params.data.title,
          status: "CREATED",
          createdAt: now,
          updatedAt: now,
          endedAt: null
        };

        rooms.push(room);
        participants.push({
          id: `participant-${participants.length + 1}`,
          roomId: room.id,
          userId: params.data.participants.create.userId,
          agentId: null,
          role: params.data.participants.create.role,
          joinedAt: now,
          leftAt: null
        });

        return room;
      },
      async findMany(params: { where: { organizationId: string }; orderBy: { createdAt: "desc" } }) {
        return rooms.filter((room) => room.organizationId === params.where.organizationId);
      },
      async findFirst(params: {
        where: { id: string; organization: { members: { some: { userId: string } } } };
        include?: { participants: true | { include: { agent: true; user: true } } };
      }) {
        const room = rooms.find((candidate) => candidate.id === params.where.id);

        if (!room) {
          return null;
        }

        const isMember = memberships.some(
          (membership) =>
            membership.organizationId === room.organizationId &&
            membership.userId === params.where.organization.members.some.userId
        );

        if (!isMember) {
          return null;
        }

        return {
          ...room,
          participants: participants
            .filter((participant) => participant.roomId === room.id)
            .map((participant) => ({
              ...participant,
              agent: participant.agentId ? agents.find((agent) => agent.id === participant.agentId) ?? null : null,
              user: participant.userId ? users.find((user) => user.id === participant.userId) ?? null : null
            }))
        };
      },
      async findUnique(params: { where: { id: string } }) {
        return rooms.find((room) => room.id === params.where.id) ?? null;
      },
      async update(params: { where: { id: string }; data: { title: string } }) {
        const room = rooms.find((candidate) => candidate.id === params.where.id);

        if (!room) {
          throw new Error("Room not found.");
        }

        room.title = params.data.title;
        room.updatedAt = now;

        return room;
      },
      async delete(params: { where: { id: string } }) {
        const roomIndex = rooms.findIndex((candidate) => candidate.id === params.where.id);

        if (roomIndex === -1) {
          throw new Error("Room not found.");
        }

        const room = rooms[roomIndex];
        rooms.splice(roomIndex, 1);

        for (let index = participants.length - 1; index >= 0; index -= 1) {
          if (participants[index]?.roomId === room.id) {
            participants.splice(index, 1);
          }
        }

        return room;
      }
    },
    roomParticipant: {
      async upsert(params: {
        where:
          | { roomId_userId: { roomId: string; userId: string } }
          | { roomId_agentId: { roomId: string; agentId: string } };
        create:
          | { roomId: string; userId: string; role: "MEMBER" }
          | { roomId: string; agentId: string; role: "AGENT" };
        update: { leftAt: null };
      }) {
        const roomUserKey = "roomId_userId" in params.where ? params.where.roomId_userId : null;
        const roomAgentKey = "roomId_agentId" in params.where ? params.where.roomId_agentId : null;
        const existing =
          participants.find(
            (participant) =>
              (roomUserKey
                ? participant.roomId === roomUserKey.roomId && participant.userId === roomUserKey.userId
                : false) ||
              (roomAgentKey
                ? participant.roomId === roomAgentKey.roomId && participant.agentId === roomAgentKey.agentId
                : false)
          ) ?? null;

        if (existing) {
          existing.leftAt = params.update.leftAt;
          return existing;
        }

        const participant: FakeRoomParticipant = {
          id: `participant-${participants.length + 1}`,
          roomId: params.create.roomId,
          userId: "userId" in params.create ? params.create.userId : null,
          agentId: "agentId" in params.create ? params.create.agentId : null,
          role: params.create.role,
          joinedAt: now,
          leftAt: null
        };

        participants.push(participant);

        return participant;
      },
      async findUnique(params: {
        where: {
          roomId_agentId?: { roomId: string; agentId: string };
          roomId_userId?: { roomId: string; userId: string };
        };
      }) {
        const roomAgentKey = params.where.roomId_agentId;
        const roomUserKey = params.where.roomId_userId;

        return (
          participants.find(
            (participant) =>
              (roomAgentKey
                ? participant.roomId === roomAgentKey.roomId && participant.agentId === roomAgentKey.agentId
                : false) ||
              (roomUserKey
                ? participant.roomId === roomUserKey.roomId && participant.userId === roomUserKey.userId
                : false)
          ) ?? null
        );
      },
      async findMany(params: {
        where: { roomId: string; agentId?: { not: null } };
        include?: { agent?: true; user?: true };
        orderBy?: { joinedAt: "asc" | "desc" };
      }) {
        let matchingParticipants = participants.filter((participant) => participant.roomId === params.where.roomId);

        if (params.where.agentId) {
          matchingParticipants = matchingParticipants.filter((participant) => participant.agentId !== null);
        }

        return sortByJoinedAt(matchingParticipants, params.orderBy?.joinedAt).map((participant) => ({
          ...participant,
          agent:
            params.include?.agent && participant.agentId
              ? agents.find((agent) => agent.id === participant.agentId) ?? null
              : null,
          user:
            params.include?.user && participant.userId
              ? users.find((user) => user.id === participant.userId) ?? null
              : null
        }));
      }
    },
    task: {
      async create(params: {
        data: {
          roomId: string;
          createdByUserId: string | null;
          createdByAgentId: string | null;
          assignedAgentId: string | null;
          title: string;
          description: string | null;
          status: FakeTask["status"];
          riskLevel: FakeTask["riskLevel"];
        };
      }) {
        const task: FakeTask = {
          id: `task-${tasks.length + 1}`,
          roomId: params.data.roomId,
          createdByUserId: params.data.createdByUserId,
          createdByAgentId: params.data.createdByAgentId,
          assignedAgentId: params.data.assignedAgentId,
          title: params.data.title,
          description: params.data.description,
          status: params.data.status,
          riskLevel: params.data.riskLevel,
          createdAt: now,
          updatedAt: now,
          completedAt: null
        };

        tasks.push(task);

        return task;
      },
      async findFirst(params: { where: { id: string; roomId: string } }) {
        return tasks.find((task) => task.id === params.where.id && task.roomId === params.where.roomId) ?? null;
      },
      async update(params: {
        where: { id: string };
        data: { assignedAgentId?: string; status: FakeTask["status"]; completedAt: Date | null };
      }) {
        const task = tasks.find((candidate) => candidate.id === params.where.id);

        if (!task) {
          throw new Error("Task not found.");
        }

        if (params.data.assignedAgentId !== undefined) {
          task.assignedAgentId = params.data.assignedAgentId;
        }

        task.status = params.data.status;
        task.completedAt = params.data.completedAt;
        task.updatedAt = now;

        return task;
      },
      async findMany(params: {
        where: { roomId: string };
        include?: {
          artifacts?: {
            include?: { versions?: { orderBy: { version: "desc" }; take: number } };
            orderBy?: { createdAt: "asc" | "desc" };
          };
          events?: {
            where?: { type: string };
            orderBy?: { occurredAt: "asc" | "desc" };
          };
        };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        const matchingTasks = sortByCreatedAt(
          tasks.filter((task) => task.roomId === params.where.roomId),
          params.orderBy?.createdAt
        );

        if (!params.include?.artifacts) {
          return matchingTasks;
        }

        return matchingTasks.map((task) => ({
          ...task,
          artifacts: sortByCreatedAt(
            artifacts.filter((artifact) => artifact.taskId === task.id),
            params.include?.artifacts?.orderBy?.createdAt
          ).map((artifact) => ({
            ...artifact,
            versions: sortArtifactVersions(
              artifactVersions.filter((version) => version.artifactId === artifact.id)
            ).slice(0, params.include?.artifacts?.include?.versions?.take ?? artifactVersions.length)
          })),
          events: sortByOccurredAt(
            taskEvents.filter(
              (event) =>
                event.taskId === task.id &&
                (!params.include?.events?.where?.type || event.type === params.include.events.where.type)
            ),
            params.include?.events?.orderBy?.occurredAt
          )
        }));
      }
    },
    taskEvent: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string;
          type: string;
          payload: Record<string, unknown>;
        };
      }) {
        const taskEvent: FakeTaskEvent = {
          id: `task-event-${taskEvents.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          type: params.data.type,
          payload: params.data.payload,
          occurredAt: new Date(now.getTime() + taskEvents.length + 1)
        };

        taskEvents.push(taskEvent);

        return taskEvent;
      },
      async findUnique(params: { where: { id: string } }) {
        return taskEvents.find((event) => event.id === params.where.id) ?? null;
      },
      async findMany(params: {
        where: { roomId: string; occurredAt?: { gt: Date } };
        orderBy?: Array<{ occurredAt?: "asc" | "desc"; id?: "asc" | "desc" }>;
        cursor?: { id: string };
        skip?: number;
        take?: number;
      }) {
        let matchingEvents = taskEvents.filter(
          (event) =>
            event.roomId === params.where.roomId &&
            (!params.where.occurredAt || event.occurredAt > params.where.occurredAt.gt)
        );

        matchingEvents = sortByTaskEventOrder(matchingEvents, params.orderBy);

        if (params.cursor) {
          const cursorIndex = matchingEvents.findIndex((event) => event.id === params.cursor?.id);

          if (cursorIndex !== -1) {
            matchingEvents = matchingEvents.slice(cursorIndex + (params.skip ?? 0));
          }
        }

        return matchingEvents.slice(0, params.take ?? matchingEvents.length);
      }
    },
    artifact: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string;
          createdByUserId: string | null;
          createdByAgentId: string | null;
          type: FakeArtifact["type"];
          status: FakeArtifact["status"];
          title: string;
        };
      }) {
        const artifact: FakeArtifact = {
          id: `artifact-${artifacts.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          createdByUserId: params.data.createdByUserId,
          createdByAgentId: params.data.createdByAgentId,
          type: params.data.type,
          status: params.data.status,
          title: params.data.title,
          createdAt: now,
          updatedAt: now
        };

        artifacts.push(artifact);

        return artifact;
      },
      async findFirst(params: {
        where: { id: string; roomId: string };
        include?: { versions?: { orderBy: { version: "desc" }; take: number } };
      }) {
        const artifact = artifacts.find(
          (candidate) => candidate.id === params.where.id && candidate.roomId === params.where.roomId
        );

        if (!artifact) {
          return null;
        }

        return {
          ...artifact,
          versions: sortArtifactVersions(
            artifactVersions.filter((version) => version.artifactId === artifact.id)
          ).slice(0, params.include?.versions?.take ?? artifactVersions.length)
        };
      },
      async update(params: { where: { id: string }; data: { title?: string; status?: FakeArtifact["status"] } }) {
        const artifact = artifacts.find((candidate) => candidate.id === params.where.id);

        if (!artifact) {
          throw new Error("Artifact not found.");
        }

        if (params.data.title !== undefined) {
          artifact.title = params.data.title;
        }

        if (params.data.status !== undefined) {
          artifact.status = params.data.status;
        }

        artifact.updatedAt = now;

        return artifact;
      }
    },
    artifactVersion: {
      async create(params: {
        data: {
          artifactId: string;
          createdByUserId: string | null;
          createdByAgentId: string | null;
          version: number;
          content: Record<string, unknown>;
        };
      }) {
        const artifactVersion: FakeArtifactVersion = {
          id: `artifact-version-${artifactVersions.length + 1}`,
          artifactId: params.data.artifactId,
          createdByUserId: params.data.createdByUserId,
          createdByAgentId: params.data.createdByAgentId,
          version: params.data.version,
          content: params.data.content,
          createdAt: now
        };

        artifactVersions.push(artifactVersion);

        return artifactVersion;
      }
    },
    approval: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          artifactId: string | null;
          requestedByAgentId: string | null;
          title: string;
          status: FakeApproval["status"];
          riskLevel: FakeApproval["riskLevel"];
        };
      }) {
        const approval: FakeApproval = {
          id: `approval-${approvals.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          artifactId: params.data.artifactId,
          requestedByUserId: null,
          requestedByAgentId: params.data.requestedByAgentId,
          decidedByUserId: null,
          title: params.data.title,
          status: params.data.status,
          riskLevel: params.data.riskLevel,
          createdAt: new Date(now.getTime() + approvals.length + 1),
          decidedAt: null
        };

        approvals.push(approval);

        return approval;
      },
      async findMany(params: { where: { roomId: string }; orderBy?: { createdAt: "asc" | "desc" } }) {
        return sortByCreatedAt(
          approvals.filter((approval) => approval.roomId === params.where.roomId),
          params.orderBy?.createdAt
        );
      },
      async findFirst(params: { where: { id: string; roomId: string } }) {
        return (
          approvals.find(
            (approval) => approval.id === params.where.id && approval.roomId === params.where.roomId
          ) ?? null
        );
      },
      async update(params: {
        where: { id: string };
        data: { status: FakeApproval["status"]; decidedAt: Date; decidedByUserId: string };
      }) {
        const approval = approvals.find((candidate) => candidate.id === params.where.id);

        if (!approval) {
          throw new Error("Approval not found.");
        }

        approval.status = params.data.status;
        approval.decidedAt = params.data.decidedAt;
        approval.decidedByUserId = params.data.decidedByUserId;

        return approval;
      }
    },
    auditLog: {
      async create(params: {
        data: {
          organizationId: string | null;
          roomId: string | null;
          actorUserId: string | null;
          actorAgentId: string | null;
          action: string;
          targetType: string;
          targetId: string | null;
          payload: Record<string, unknown>;
        };
      }) {
        const auditLog: FakeAuditLog = {
          id: `audit-${auditLogs.length + 1}`,
          organizationId: params.data.organizationId,
          roomId: params.data.roomId,
          actorUserId: params.data.actorUserId,
          actorAgentId: params.data.actorAgentId,
          action: params.data.action,
          targetType: params.data.targetType,
          targetId: params.data.targetId,
          payload: params.data.payload,
          createdAt: new Date(now.getTime() + auditLogs.length + 1)
        };

        auditLogs.push(auditLog);

        return auditLog;
      },
      async findMany(params: {
        where: { roomId: string; action?: string; createdAt?: { gt: Date } };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        return sortByCreatedAt(
          auditLogs.filter(
            (auditLog) =>
              auditLog.roomId === params.where.roomId &&
              (!params.where.action || auditLog.action === params.where.action) &&
              (!params.where.createdAt || auditLog.createdAt > params.where.createdAt.gt)
          ),
          params.orderBy?.createdAt
        );
      }
    },
    transcriptSegment: {
      async create(params: {
        data: {
          roomId: string;
          speakerUserId: string;
          text: string;
          startedAt: Date;
          endedAt: Date | null;
        };
      }) {
        const transcriptSegment: FakeTranscriptSegment = {
          id: `transcript-${transcriptSegments.length + 1}`,
          roomId: params.data.roomId,
          speakerUserId: params.data.speakerUserId,
          speakerAgentId: null,
          text: params.data.text,
          startedAt: params.data.startedAt,
          endedAt: params.data.endedAt,
          createdAt: now
        };

        transcriptSegments.push(transcriptSegment);

        return transcriptSegment;
      },
      async findMany(params: { where: { roomId: string }; orderBy?: { startedAt: "asc" | "desc" } }) {
        return sortByStartedAt(
          transcriptSegments.filter((segment) => segment.roomId === params.where.roomId),
          params.orderBy?.startedAt
        );
      }
    },
    async $disconnect() {}
  } as unknown as FakeApiDatabase;

  db.agentConnectionRecords = agentConnections;
  db.agentRecords = agents;
  db.approvalRecords = approvals;
  db.auditLogRecords = auditLogs;
  db.artifactRecords = artifacts;
  db.artifactVersionRecords = artifactVersions;
  db.taskEventRecords = taskEvents;
  db.taskRecords = tasks;
  db.transcriptSegmentRecords = transcriptSegments;

  return db;
}

function sortByCreatedAt<T extends { createdAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.createdAt.getTime() - right.createdAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByJoinedAt<T extends { joinedAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.joinedAt.getTime() - right.joinedAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByStartedAt<T extends { startedAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.startedAt.getTime() - right.startedAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortArtifactVersions(items: FakeArtifactVersion[]): FakeArtifactVersion[] {
  return [...items].sort((left, right) => right.version - left.version);
}

function sortByOccurredAt<T extends { occurredAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.occurredAt.getTime() - right.occurredAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByTaskEventOrder(
  items: FakeTaskEvent[],
  orderBy: Array<{ occurredAt?: "asc" | "desc"; id?: "asc" | "desc" }> = [{ occurredAt: "asc" }]
): FakeTaskEvent[] {
  return [...items].sort((left, right) => {
    for (const order of orderBy) {
      if (order.occurredAt) {
        const comparison = left.occurredAt.getTime() - right.occurredAt.getTime();

        if (comparison !== 0) {
          return order.occurredAt === "asc" ? comparison : -comparison;
        }
      }

      if (order.id) {
        const comparison = left.id.localeCompare(right.id);

        if (comparison !== 0) {
          return order.id === "asc" ? comparison : -comparison;
        }
      }
    }

    return 0;
  });
}
