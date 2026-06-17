import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { ZodError } from "zod";
import { healthStatusSchema, type HealthStatus } from "@jean/shared";

import type { ApiDatabase } from "./db.js";
import { HttpError } from "./errors.js";
import { createLiveKitTokenIssuer, type LiveKitTokenIssuer } from "./livekit.js";
import { registerAuth } from "./plugins/auth.js";
import { registerDb } from "./plugins/db.js";
import { registerRoomEvents } from "./plugins/room-events.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerRoomEventRoutes } from "./routes/room-events.js";
import { registerRoomMcpRoutes } from "./routes/room-mcp.js";
import { registerRoomRoutes } from "./routes/rooms.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import type { AgentConnector } from "./jean-task-runner.js";
import type { RoomEventBus } from "./room-event-bus.js";

export type BuildServerOptions = {
  agentConnectors?: AgentConnector[];
  db?: ApiDatabase;
  liveKitTokenIssuer?: LiveKitTokenIssuer;
  logger?: boolean;
  roomEventBus?: RoomEventBus;
  workerToken?: string | null;
};

export function buildServer(options: BuildServerOptions = {}) {
  const server = Fastify({ logger: options.logger ?? true });
  const liveKitTokenIssuer = options.liveKitTokenIssuer ?? createLiveKitTokenIssuer();

  void server.register(fastifyWebsocket);
  registerDb(server, options.db);
  registerAuth(server);
  registerRoomEvents(server, options.roomEventBus);

  server.get("/health", async (): Promise<HealthStatus> => ({
    service: "api",
    ok: true
  }));

  registerOrganizationRoutes(server);
  registerRoomRoutes(server, liveKitTokenIssuer);
  registerRoomMcpRoutes(server);
  registerTaskRoutes(server);
  server.register(async (eventRouteServer) => {
    registerRoomEventRoutes(eventRouteServer, {
      agentConnectors: options.agentConnectors,
      workerToken: options.workerToken
    });
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Bad Request",
        issues: error.issues
      });
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.message
      });
    }

    server.log.error(error);

    return reply.code(500).send({
      error: "Internal Server Error"
    });
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  healthStatusSchema.parse({
    service: "api",
    ok: true
  });

  const server = buildServer();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";

  await server.listen({ port, host });
}
