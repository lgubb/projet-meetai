import assert from "node:assert/strict";
import test from "node:test";

import {
  agentCapabilitySchema,
  artifactStatusSchema,
  contextPackSchema,
  realtimeRoomEventSchema,
  roomEventSchema,
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
    task,
    ts: "2026-06-04T10:00:00.000Z"
  });

  const artifactCreated = realtimeRoomEventSchema.parse({
    type: "artifact.created",
    roomId: "room-1",
    artifact: {
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
    },
    ts: "2026-06-04T10:00:00.000Z"
  });

  const speech = realtimeRoomEventSchema.parse({
    type: "agent.speech",
    roomId: "room-1",
    agentId: "agent-1",
    text: "Oui, je crée une spec.",
    ts: "2026-06-04T10:00:00.000Z"
  });

  assert.equal(taskCreated.type, "task.created");
  assert.equal(artifactCreated.type, "artifact.created");
  assert.equal(speech.type, "agent.speech");
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
