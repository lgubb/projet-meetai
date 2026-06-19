import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { getAuthMode, upsertCurrentUser } from "../auth.js";
import { HttpError, notFound, unauthorized } from "../errors.js";
import { handleJeanTranscriptFinalEvent } from "../jean-flow.js";
import type { AgentConnector } from "../jean-task-runner.js";
import { realtimeRoomEventSchema } from "@jean/shared";
import { listReplayEvents } from "../room-task-service.js";

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const roomEventsQuerySchema = z
  .object({
    devUserEmail: z.string().min(1).optional(),
    devUserName: z.string().min(1).optional()
  })
  .strict();

const roomEventUserQuerySchema = z
  .object({
    devUserEmail: z.string().min(1).optional(),
    devUserName: z.string().min(1).optional()
  })
  .passthrough();

const replayEventsQuerySchema = roomEventsQuerySchema
  .extend({
    afterEventId: z.string().min(1).optional(),
    since: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
  })
  .strict();

export type RegisterRoomEventRoutesOptions = {
  agentConnectors?: AgentConnector[];
  workerToken?: string | null;
};

export function registerRoomEventRoutes(server: FastifyInstance, options: RegisterRoomEventRoutesOptions = {}): void {
  server.get("/rooms/:roomId/events/replay", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const query = replayEventsQuerySchema.parse(request.query);
    const user = await upsertRoomEventUser(server, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      events: await listReplayEvents(server, {
        roomId: params.roomId,
        afterEventId: query.afterEventId,
        since: query.since ? new Date(query.since) : undefined,
        limit: query.limit ?? 100
      })
    };
  });

  server.get("/rooms/:roomId/events", { websocket: true }, async (socket, request) => {
    try {
      const params = roomParamsSchema.parse(request.params);
      const workerToken = options.workerToken ?? process.env.WORKROOM_WORKER_TOKEN ?? null;

      if (isWorkerTokenRequest(request, workerToken)) {
        await findRoomById(server, params.roomId);
        server.roomEvents.join(params.roomId, socket);
        return;
      }

      const user = await upsertRoomEventUser(server, request);
      await findAccessibleRoom(server, params.roomId, user.id);

      server.roomEvents.join(params.roomId, socket);
    } catch (error) {
      server.log.warn(error);
      socket.close(1008, "Room event subscription rejected.");
    }
  });

  server.post("/internal/rooms/:roomId/events", async (request, reply) => {
    requireWorkerToken(request, options.workerToken ?? process.env.WORKROOM_WORKER_TOKEN ?? null);

    const params = roomParamsSchema.parse(request.params);
    const event = realtimeRoomEventSchema.parse(request.body);

    if (event.roomId !== params.roomId) {
      throw new HttpError(400, "Event roomId must match the route roomId.");
    }

    const room = await findRoomById(server, params.roomId);

    const eventToPublish =
      event.type === "transcript.final" ? await persistFinalTranscriptEvent(server, event) : event;

    server.roomEvents.publish(eventToPublish);

    if (eventToPublish.type === "transcript.final") {
      await handleJeanTranscriptFinalEvent(server, room, eventToPublish, {
        connectors: options.agentConnectors
      });
    }

    return reply.code(202).send({
      event: eventToPublish
    });
  });
}

async function upsertRoomEventUser(server: FastifyInstance, request: FastifyRequest) {
  if (getAuthMode() === "dev") {
    const query = roomEventUserQuerySchema.parse(request.query);

    if (query.devUserEmail) {
      return server.db.user.upsert({
        where: {
          email: query.devUserEmail
        },
        create: {
          email: query.devUserEmail,
          name: query.devUserName ?? null
        },
        update: {
          name: query.devUserName ?? null
        }
      });
    }
  }

  return upsertCurrentUser(server.db, request);
}

async function findAccessibleRoom(server: FastifyInstance, roomId: string, userId: string) {
  const room = await server.db.room.findFirst({
    where: {
      id: roomId,
      organization: {
        members: {
          some: {
            userId
          }
        }
      }
    }
  });

  if (!room) {
    notFound("Room not found.");
  }

  return room;
}

async function findRoomById(server: FastifyInstance, roomId: string) {
  const room = await server.db.room.findUnique({
    where: {
      id: roomId
    }
  });

  if (!room) {
    notFound("Room not found.");
  }

  return room;
}

function requireWorkerToken(request: FastifyRequest, workerToken: string | null): void {
  if (!workerToken) {
    return;
  }

  if (!isWorkerTokenRequest(request, workerToken)) {
    unauthorized("Invalid worker token.");
  }
}

function isWorkerTokenRequest(request: FastifyRequest, workerToken: string | null): boolean {
  return Boolean(workerToken && request.headers.authorization === `Bearer ${workerToken}`);
}

async function persistFinalTranscriptEvent(
  server: FastifyInstance,
  event: Extract<z.infer<typeof realtimeRoomEventSchema>, { type: "transcript.final" }>
) {
  if (event.segmentId) {
    return event;
  }

  const segment = await server.db.transcriptSegment.create({
    data: {
      roomId: event.roomId,
      speakerUserId: event.speakerId,
      text: event.text,
      startedAt: new Date(event.startedAt ?? event.ts),
      endedAt: event.endedAt ? new Date(event.endedAt) : new Date(event.ts)
    }
  });

  return {
    ...event,
    segmentId: segment.id
  };
}
