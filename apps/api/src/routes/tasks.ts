import type { FastifyInstance } from "fastify";
import { artifactStatusSchema, artifactTypeSchema, metadataSchema, taskStatusSchema } from "@jean/shared";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { notFound } from "../errors.js";
import {
  appendTaskLog,
  createTaskWithArtifact,
  listRoomTaskState,
  patchArtifact,
  updateArtifact,
  updateArtifactPreviewUrl,
  updateTaskStatus
} from "../room-task-service.js";

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const taskParamsSchema = z
  .object({
    roomId: z.string().min(1),
    taskId: z.string().min(1)
  })
  .strict();

const artifactParamsSchema = z
  .object({
    roomId: z.string().min(1),
    artifactId: z.string().min(1)
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

const updateTaskStatusBodySchema = z
  .object({
    status: taskStatusSchema
  })
  .strict();

const appendTaskLogBodySchema = z
  .object({
    message: z.string().min(1)
  })
  .strict();

const updateArtifactBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    status: artifactStatusSchema.optional(),
    content: metadataSchema.optional()
  })
  .strict()
  .refine((body) => body.title !== undefined || body.status !== undefined || body.content !== undefined);

const patchArtifactBodySchema = z
  .object({
    patch: metadataSchema
  })
  .strict();

const updateArtifactPreviewUrlBodySchema = z
  .object({
    previewUrl: z.string().url()
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

  server.patch("/rooms/:roomId/tasks/:taskId/status", async (request) => {
    const params = taskParamsSchema.parse(request.params);
    const body = updateTaskStatusBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await updateTaskStatus(server, {
      roomId: params.roomId,
      taskId: params.taskId,
      status: body.status
    });

    if (!result) {
      notFound("Task not found.");
    }

    server.roomEvents.publish(result.event);

    return {
      task: result.task
    };
  });

  server.post("/rooms/:roomId/tasks/:taskId/logs", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = appendTaskLogBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await appendTaskLog(server, {
      roomId: params.roomId,
      taskId: params.taskId,
      message: body.message
    });

    if (!result) {
      notFound("Task not found.");
    }

    server.roomEvents.publish(result.event);

    return reply.code(201).send({
      log: result.log
    });
  });

  server.patch("/rooms/:roomId/artifacts/:artifactId", async (request) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = updateArtifactBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await updateArtifact(server, {
      roomId: params.roomId,
      artifactId: params.artifactId,
      title: body.title,
      status: body.status,
      content: body.content
    });

    if (!result) {
      notFound("Artifact not found.");
    }

    server.roomEvents.publish(result.event);

    return {
      artifact: result.artifact
    };
  });

  server.post("/rooms/:roomId/artifacts/:artifactId/patches", async (request, reply) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = patchArtifactBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await patchArtifact(server, {
      roomId: params.roomId,
      artifactId: params.artifactId,
      patch: body.patch
    });

    if (!result) {
      notFound("Artifact not found.");
    }

    server.roomEvents.publish(result.event);

    return reply.code(201).send({
      artifact: result.artifact
    });
  });

  server.patch("/rooms/:roomId/artifacts/:artifactId/preview-url", async (request) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = updateArtifactPreviewUrlBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await updateArtifactPreviewUrl(server, {
      roomId: params.roomId,
      artifactId: params.artifactId,
      previewUrl: body.previewUrl
    });

    if (!result) {
      notFound("Artifact not found.");
    }

    server.roomEvents.publish(result.event);

    return {
      artifact: result.artifact
    };
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
