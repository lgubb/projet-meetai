import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { forbidden, notFound } from "../errors.js";
import type { LiveKitTokenIssuer } from "../livekit.js";

const organizationParamsSchema = z
  .object({
    organizationId: z.string().min(1)
  })
  .strict();

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const createRoomBodySchema = z
  .object({
    title: z.string().min(1)
  })
  .strict();

const updateRoomBodySchema = z
  .object({
    title: z.string().min(1)
  })
  .strict();

const liveKitTokenBodySchema = z.object({}).strict();

export function registerRoomRoutes(server: FastifyInstance, liveKitTokenIssuer: LiveKitTokenIssuer): void {
  server.get("/organizations/:organizationId/rooms", async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const rooms = await server.db.room.findMany({
      where: {
        organizationId: params.organizationId
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return {
      rooms: rooms.map(serializeRoom)
    };
  });

  server.post("/organizations/:organizationId/rooms", async (request, reply) => {
    const params = organizationParamsSchema.parse(request.params);
    const body = createRoomBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const room = await server.db.room.create({
      data: {
        organizationId: params.organizationId,
        createdByUserId: user.id,
        title: body.title,
        participants: {
          create: {
            userId: user.id,
            role: "HOST"
          }
        }
      }
    });

    return reply.code(201).send({
      room: serializeRoom(room)
    });
  });

  server.get("/rooms/:roomId", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);
    const room = await server.db.room.findFirst({
      where: {
        id: params.roomId,
        organization: {
          members: {
            some: {
              userId: user.id
            }
          }
        }
      },
      include: {
        participants: {
          include: {
            agent: true,
            user: true
          }
        }
      }
    });

    if (!room) {
      notFound("Room not found.");
    }

    return {
      room: serializeRoom(room),
      participants: room.participants.map(serializeParticipant)
    };
  });

  server.patch("/rooms/:roomId", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const body = updateRoomBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);
    const updatedRoom = await server.db.room.update({
      where: {
        id: room.id
      },
      data: {
        title: body.title
      }
    });

    return {
      room: serializeRoom(updatedRoom)
    };
  });

  server.delete("/rooms/:roomId", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);

    await server.db.room.delete({
      where: {
        id: room.id
      }
    });

    return reply.code(204).send();
  });

  server.post("/rooms/:roomId/livekit-token", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    liveKitTokenBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);
    const token = await liveKitTokenIssuer.issueRoomToken({
      roomId: room.id,
      userId: user.id,
      userName: user.name
    });

    return {
      livekit: {
        serverUrl: liveKitTokenIssuer.serverUrl,
        token,
        roomName: room.id,
        identity: user.id
      }
    };
  });

  server.post("/rooms/:roomId/join", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);
    const room = await server.db.room.findUnique({
      where: {
        id: params.roomId
      }
    });

    if (!room) {
      notFound("Room not found.");
    }

    await server.db.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: room.organizationId,
          userId: user.id
        }
      },
      create: {
        organizationId: room.organizationId,
        userId: user.id,
        role: "MEMBER"
      },
      update: {}
    });

    const participant = await server.db.roomParticipant.upsert({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id
        }
      },
      create: {
        roomId: room.id,
        userId: user.id,
        role: "MEMBER"
      },
      update: {
        leftAt: null
      }
    });

    return reply.code(201).send({
      room: serializeRoom(room),
      participant: serializeParticipant(participant)
    });
  });
}

async function requireOrganizationMember(server: FastifyInstance, organizationId: string, userId: string): Promise<void> {
  const membership = await server.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    }
  });

  if (!membership) {
    forbidden("Organization membership required.");
  }
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

function serializeRoom(room: {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
}) {
  return {
    id: room.id,
    organizationId: room.organizationId,
    title: room.title,
    status: room.status,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    endedAt: room.endedAt?.toISOString() ?? null
  };
}

function serializeParticipant(participant: {
  id: string;
  roomId: string;
  userId: string | null;
  agentId: string | null;
  user?: {
    email: string;
    name: string | null;
  } | null;
  agent?: {
    name: string;
  } | null;
  role: string;
  joinedAt: Date;
  leftAt: Date | null;
}) {
  return {
    id: participant.id,
    roomId: participant.roomId,
    userId: participant.userId,
    agentId: participant.agentId,
    userEmail: participant.user?.email ?? null,
    userName: participant.user?.name ?? null,
    agentName: participant.agent?.name ?? null,
    role: participant.role,
    joinedAt: participant.joinedAt.toISOString(),
    leftAt: participant.leftAt?.toISOString() ?? null
  };
}
