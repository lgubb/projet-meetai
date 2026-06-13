import assert from "node:assert/strict";
import test from "node:test";

import type { ApiDatabase } from "./db.js";
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

type FakeApiDatabase = ApiDatabase & {
  agentRecords: FakeAgent[];
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
  const nextMessages = readSocketMessages<{ type: string; task?: { title: string }; text?: string }>(socket, 4);

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
    ["task.created", "artifact.created", "agent.speech"]
  );

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    ["transcript.final", "task.created", "artifact.created", "agent.speech"]
  );
  assert.equal(messages[1]?.task?.title, "Spec");
  assert.equal(messages[3]?.text, "Oui, je crée une spec.");

  socket.terminate();
  await server.close();
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

function createFakeDb(): FakeApiDatabase {
  const now = new Date("2026-06-06T12:00:00.000Z");
  const users: FakeUser[] = [];
  const organizations: FakeOrganization[] = [];
  const memberships: FakeOrganizationMember[] = [];
  const rooms: FakeRoom[] = [];
  const participants: FakeRoomParticipant[] = [];
  const agents: FakeAgent[] = [];
  const tasks: FakeTask[] = [];
  const taskEvents: FakeTaskEvent[] = [];
  const artifacts: FakeArtifact[] = [];
  const artifactVersions: FakeArtifactVersion[] = [];
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
              agent: null,
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
        where: { roomId_userId: { roomId: string; userId: string } };
        create: { roomId: string; userId: string; role: "MEMBER" };
        update: { leftAt: null };
      }) {
        const existing =
          participants.find(
            (participant) =>
              participant.roomId === params.where.roomId_userId.roomId &&
              participant.userId === params.where.roomId_userId.userId
          ) ?? null;

        if (existing) {
          existing.leftAt = params.update.leftAt;
          return existing;
        }

        const participant: FakeRoomParticipant = {
          id: `participant-${participants.length + 1}`,
          roomId: params.create.roomId,
          userId: params.create.userId,
          agentId: null,
          role: params.create.role,
          joinedAt: now,
          leftAt: null
        };

        participants.push(participant);

        return participant;
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
      async findMany(params: {
        where: { roomId: string };
        include?: {
          artifacts?: {
            include?: { versions?: { orderBy: { version: "desc" }; take: number } };
            orderBy?: { createdAt: "asc" | "desc" };
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
          }))
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
          occurredAt: now
        };

        taskEvents.push(taskEvent);

        return taskEvent;
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
      }
    },
    async $disconnect() {}
  } as unknown as FakeApiDatabase;

  db.agentRecords = agents;
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

function sortArtifactVersions(items: FakeArtifactVersion[]): FakeArtifactVersion[] {
  return [...items].sort((left, right) => right.version - left.version);
}
