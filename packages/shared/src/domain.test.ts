import assert from "node:assert/strict";
import test from "node:test";

import {
  agentCapabilitySchema,
  agentRunSchema,
  approvalRequestSchema,
  artifactStatusSchema,
  contextPackSchema,
  realtimeRoomEventSchema,
  roomAgentSchema,
  roomEventSchema,
  sandboxSessionSchema,
  taskStatusSchema,
  userRoleSchema
} from "./domain.js";

test("domain enum schemas accept known values", () => {
  assert.equal(userRoleSchema.parse("OWNER"), "OWNER");
  assert.equal(agentCapabilitySchema.parse("ORCHESTRATION"), "ORCHESTRATION");
  assert.equal(taskStatusSchema.parse("WAITING_FOR_APPROVAL"), "WAITING_FOR_APPROVAL");
  assert.equal(artifactStatusSchema.parse("READY"), "READY");
});

test("domain enum schemas reject unknown values", () => {
  assert.throws(() => userRoleSchema.parse("SUPER_ADMIN"));
  assert.throws(() => taskStatusSchema.parse("DONE"));
});

test("roomEventSchema validates a strict event envelope", () => {
  const event = roomEventSchema.parse({
    id: "event-1",
    roomId: "room-1",
    type: "TASK_CREATED",
    occurredAt: "2026-06-04T10:00:00.000Z",
    actorUserId: "user-1",
    actorAgentId: null,
    taskId: "task-1",
    artifactId: null,
    approvalId: null,
    payload: {
      title: "Draft spec"
    }
  });

  assert.equal(event.type, "TASK_CREATED");
  assert.throws(() =>
    roomEventSchema.parse({
      ...event,
      unexpected: true
    })
  );
});

test("realtimeRoomEventSchema validates transcript events", () => {
  const partial = realtimeRoomEventSchema.parse({
    type: "transcript.partial",
    roomId: "room-1",
    speakerId: "user-1",
    text: "Hello",
    ts: "2026-06-04T10:00:00.000Z"
  });

  const final = realtimeRoomEventSchema.parse({
    type: "transcript.final",
    roomId: "room-1",
    speakerId: "user-1",
    text: "Hello room",
    ts: "2026-06-04T10:00:01.000Z",
    segmentId: "segment-1"
  });

  assert.equal(partial.type, "transcript.partial");
  assert.equal(final.type, "transcript.final");
  assert.throws(() =>
    realtimeRoomEventSchema.parse({
      ...final,
      unexpected: true
    })
  );
});

test("realtimeRoomEventSchema validates task, artifact, and agent speech events", () => {
  const task = {
    id: "task-1",
    roomId: "room-1",
    createdByUserId: null,
    createdByAgentId: "agent-1",
    assignedAgentId: "agent-1",
    title: "Spec",
    description: "Create a product spec",
    status: "PENDING",
    riskLevel: "LOW",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    completedAt: null
  };

  const taskCreated = realtimeRoomEventSchema.parse({
    type: "task.created",
    roomId: "room-1",
    eventId: "event-1",
    task,
    ts: "2026-06-04T10:00:00.000Z"
  });

  const taskStatus = realtimeRoomEventSchema.parse({
    type: "task.status",
    roomId: "room-1",
    eventId: "event-2",
    task: {
      ...task,
      status: "RUNNING"
    },
    ts: "2026-06-04T10:00:01.000Z"
  });

  const taskLog = realtimeRoomEventSchema.parse({
    type: "task.log",
    roomId: "room-1",
    eventId: "event-3",
    taskId: "task-1",
    log: {
      id: "event-3",
      roomId: "room-1",
      taskId: "task-1",
      message: "Collecting context",
      createdAt: "2026-06-04T10:00:02.000Z"
    },
    ts: "2026-06-04T10:00:02.000Z"
  });

  const artifact = {
    id: "artifact-1",
    roomId: "room-1",
    taskId: "task-1",
    createdByUserId: null,
    createdByAgentId: "agent-1",
    type: "DOCUMENT",
    status: "DRAFT",
    title: "Spec",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    latestVersion: {
      id: "version-1",
      version: 1,
      content: {
        text: "Draft spec"
      },
      createdAt: "2026-06-04T10:00:00.000Z"
    }
  };

  const patchedArtifact = {
    ...artifact,
    latestVersion: {
      id: "version-2",
      version: 2,
      content: {
        text: "Updated draft"
      },
      createdAt: "2026-06-04T10:00:03.000Z"
    }
  };

  const artifactCreated = realtimeRoomEventSchema.parse({
    type: "artifact.created",
    roomId: "room-1",
    eventId: "event-4",
    artifact,
    ts: "2026-06-04T10:00:00.000Z"
  });

  const artifactPatch = realtimeRoomEventSchema.parse({
    type: "artifact.patch",
    roomId: "room-1",
    eventId: "event-5",
    artifact: patchedArtifact,
    patch: {
      text: "Updated draft"
    },
    ts: "2026-06-04T10:00:03.000Z"
  });

  const artifactUpdated = realtimeRoomEventSchema.parse({
    type: "artifact.updated",
    roomId: "room-1",
    eventId: "event-6",
    artifact: patchedArtifact,
    ts: "2026-06-04T10:00:04.000Z"
  });

  const artifactPreviewUrl = realtimeRoomEventSchema.parse({
    type: "artifact.preview_url",
    roomId: "room-1",
    eventId: "event-7",
    artifact: patchedArtifact,
    previewUrl: "https://example.com/preview",
    ts: "2026-06-04T10:00:05.000Z"
  });

  const speech = realtimeRoomEventSchema.parse({
    type: "agent.speech",
    roomId: "room-1",
    eventId: "event-8",
    agentId: "agent-1",
    text: "Oui, je crée une spec.",
    ts: "2026-06-04T10:00:00.000Z"
  });
  const auditEvent = realtimeRoomEventSchema.parse({
    type: "room.event",
    roomId: "room-1",
    eventId: "event-9",
    event: {
      id: "event-9",
      roomId: "room-1",
      type: "APPROVAL_REQUESTED",
      occurredAt: "2026-06-04T10:00:06.000Z",
      actorUserId: null,
      actorAgentId: "agent-1",
      taskId: "task-1",
      artifactId: "artifact-1",
      approvalId: "approval-1",
      payload: {}
    },
    ts: "2026-06-04T10:00:06.000Z"
  });

  assert.equal(taskCreated.type, "task.created");
  assert.equal(taskStatus.type, "task.status");
  assert.equal(taskLog.type, "task.log");
  assert.equal(artifactCreated.type, "artifact.created");
  assert.equal(artifactPatch.type, "artifact.patch");
  assert.equal(artifactUpdated.type, "artifact.updated");
  assert.equal(artifactPreviewUrl.type, "artifact.preview_url");
  assert.equal(speech.type, "agent.speech");
  assert.equal(auditEvent.type, "room.event");
  assert.throws(() =>
    realtimeRoomEventSchema.parse({
      ...speech,
      unexpected: true
    })
  );
});

test("contextPackSchema validates reusable room context", () => {
  const contextPack = contextPackSchema.parse({
    id: "context-1",
    roomId: "room-1",
    taskId: "task-1",
    createdAt: "2026-06-04T10:00:00.000Z",
    objective: "Prepare the next action",
    instructions: ["Use only validated room context"],
    transcriptSegmentIds: ["segment-1"],
    artifactIds: ["artifact-1"],
    roomEventIds: ["event-1"],
    metadata: {}
  });

  assert.deepEqual(contextPack.artifactIds, ["artifact-1"]);
});

test("phase 8 room-agent contract schemas validate strict envelopes", () => {
  const agent = roomAgentSchema.parse({
    id: "agent-1",
    roomId: "room-1",
    name: "Codex",
    provider: "CODEX",
    transport: "HTTP",
    capabilities: ["CODE_GENERATION"],
    registeredAt: "2026-06-16T10:00:00.000Z",
    lastHeartbeatAt: null,
    metadata: {}
  });
  const run = agentRunSchema.parse({
    id: "run-1",
    roomId: "room-1",
    agentId: agent.id,
    taskId: "task-1",
    status: "RUNNING",
    startedAt: "2026-06-16T10:00:00.000Z",
    finishedAt: null,
    summary: null,
    metadata: {}
  });
  const approval = approvalRequestSchema.parse({
    id: "approval-1",
    roomId: "room-1",
    taskId: "task-1",
    artifactId: null,
    requestedByAgentId: agent.id,
    status: "PENDING",
    riskLevel: "MEDIUM",
    action: "publish_preview",
    reason: "Expose preview URL",
    payload: {},
    createdAt: "2026-06-16T10:00:01.000Z",
    decidedAt: null,
    decidedByUserId: null
  });
  const sandbox = sandboxSessionSchema.parse({
    id: "sandbox-1",
    roomId: "room-1",
    taskId: "task-1",
    createdByAgentId: agent.id,
    provider: "E2B",
    status: "RUNNING",
    workdir: "/tmp/workroom-preview",
    previewUrl: "https://3000-example.e2b.app",
    createdAt: "2026-06-16T10:00:02.000Z",
    updatedAt: "2026-06-16T10:00:03.000Z",
    metadata: {}
  });

  assert.equal(run.status, "RUNNING");
  assert.equal(approval.status, "PENDING");
  assert.equal(sandbox.provider, "E2B");
  assert.throws(() =>
    roomAgentSchema.parse({
      ...agent,
      unexpected: true
    })
  );
});
