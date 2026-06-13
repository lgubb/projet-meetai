import type { FastifyInstance } from "fastify";
import { artifactTypeSchema, metadataSchema } from "@jean/shared";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { notFound } from "../errors.js";
import { createTaskWithArtifact, listRoomTaskState } from "../room-task-service.js";

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const createTaskBodySchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    artifact: z
      .object({
        title: z.string().min(1).optional(),
        type: artifactTypeSchema.optional(),
        content: metadataSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict();

export function registerTaskRoutes(server: FastifyInstance): void {
  server.get("/rooms/:roomId/tasks", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      items: await listRoomTaskState(server, params.roomId)
    };
  });

  server.post("/rooms/:roomId/tasks", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const body = createTaskBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const bundle = await createTaskWithArtifact(server, {
      roomId: params.roomId,
      createdByUserId: user.id,
      title: body.title,
      description: body.description ?? null,
      artifact: {
        title: body.artifact?.title ?? body.title,
        type: body.artifact?.type ?? "DOCUMENT",
        content: body.artifact?.content ?? {
          text: `Draft for ${body.title}`
        }
      }
    });

    for (const event of bundle.events) {
      server.roomEvents.publish(event);
    }

    return reply.code(201).send({
      task: bundle.task,
      artifact: bundle.artifact
    });
  });
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
