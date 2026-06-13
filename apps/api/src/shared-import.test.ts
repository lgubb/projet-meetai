import assert from "node:assert/strict";
import test from "node:test";

import { healthStatusSchema, roomEventSchema, type RoomEvent } from "@jean/shared";

test("@jean/shared can be imported from the API app", () => {
  const status = healthStatusSchema.parse({
    service: "api",
    ok: true
  });

  const event: RoomEvent = roomEventSchema.parse({
    id: "event-1",
    roomId: "room-1",
    type: "ROOM_CREATED",
    occurredAt: "2026-06-04T10:00:00.000Z",
    actorUserId: "user-1",
    actorAgentId: null,
    taskId: null,
    artifactId: null,
    approvalId: null,
    payload: {}
  });

  assert.equal(status.service, "api");
  assert.equal(event.type, "ROOM_CREATED");
});
