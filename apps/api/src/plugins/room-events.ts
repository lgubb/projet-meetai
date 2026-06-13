import type { FastifyInstance } from "fastify";

import { RoomEventBus } from "../room-event-bus.js";

declare module "fastify" {
  interface FastifyInstance {
    roomEvents: RoomEventBus;
  }
}

export function registerRoomEvents(server: FastifyInstance, roomEventBus = new RoomEventBus()): void {
  server.decorate("roomEvents", roomEventBus);
  server.addHook("onClose", async () => {
    roomEventBus.close();
  });
}
