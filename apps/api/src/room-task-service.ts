import type { FastifyInstance } from "fastify";
import type { Prisma } from "@jean/db";
import {
  roomEventSchema,
  realtimeRoomEventSchema,
  type ArtifactStatus,
  type ArtifactType,
  type RealtimeArtifact,
  type RealtimeRoomEvent,
  type RealtimeTask,
  type RealtimeTaskLog,
  type TaskRiskLevel,
  type TaskStatus
} from "@jean/shared";

export type CreateTaskWithArtifactInput = {
  roomId: string;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
  assignedAgentId?: string | null;
  title: string;
  description?: string | null;
  artifact: {
    title: string;
    type: ArtifactType;
    content: Record<string, unknown>;
  };
};

export type CreateArtifactInput = {
  roomId: string;
  taskId: string;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
  title: string;
  type: ArtifactType;
  content: Record<string, unknown>;
};

export type CreateTaskInput = {
  roomId: string;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
  assignedAgentId?: string | null;
  title: string;
  description?: string | null;
  riskLevel?: TaskRiskLevel;
};

export type TaskArtifactBundle = {
  task: RealtimeTask;
  artifact: RealtimeArtifact;
  events: [RealtimeRoomEvent, RealtimeRoomEvent];
};

export type RoomTaskState = {
  task: RealtimeTask;
  artifacts: RealtimeArtifact[];
  logs: RealtimeTaskLog[];
};

type TaskRecord = {
  id: string;
  roomId: string;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  assignedAgentId: string | null;
  title: string;
  description: string | null;
  status: string;
  riskLevel: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type ArtifactRecord = {
  id: string;
  roomId: string;
  taskId: string | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  type: string;
  status: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  versions?: ArtifactVersionRecord[];
};

type ArtifactVersionRecord = {
  id: string;
  version: number;
  content: unknown;
  createdAt: Date;
};

type TaskEventRecord = {
  id: string;
  roomId: string;
  taskId: string;
  type: string;
  payload: unknown | null;
  occurredAt: Date;
};

type AuditLogRecord = {
  id: string;
  roomId: string | null;
  actorUserId: string | null;
  actorAgentId: string | null;
  action: string;
  payload: unknown | null;
  createdAt: Date;
};

type TaskWithArtifactsRecord = TaskRecord & {
  artifacts: ArtifactRecord[];
  events?: TaskEventRecord[];
};

type ArtifactWithVersionsRecord = ArtifactRecord & {
  versions: ArtifactVersionRecord[];
};

export async function createTaskWithArtifact(
  server: FastifyInstance,
  input: CreateTaskWithArtifactInput
): Promise<TaskArtifactBundle> {
  const task = await server.db.task.create({
    data: {
      roomId: input.roomId,
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      assignedAgentId: input.assignedAgentId ?? input.createdByAgentId ?? null,
      title: input.title,
      description: input.description ?? null,
      status: "PENDING",
      riskLevel: "LOW"
    }
  });

  const serializedTask = serializeTask(task);
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: task.id,
    type: "task.created",
    payload: {
      task: serializedTask
    }
  });

  const artifact = await server.db.artifact.create({
    data: {
      roomId: input.roomId,
      taskId: task.id,
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      type: input.artifact.type,
      status: "DRAFT",
      title: input.artifact.title
    }
  });
  const version = await server.db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      version: 1,
      content: input.artifact.content as Prisma.InputJsonValue
    }
  });

  const serializedArtifact = serializeArtifact({
    ...artifact,
    versions: [version]
  });
  const artifactEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: task.id,
    type: "artifact.created",
    payload: {
      artifact: serializedArtifact
    }
  });

  return {
    task: serializedTask,
    artifact: serializedArtifact,
    events: [
      realtimeRoomEventSchema.parse({
        type: "task.created",
        roomId: input.roomId,
        eventId: taskEvent.id,
        task: serializedTask,
        ts: taskEvent.occurredAt.toISOString()
      }),
      realtimeRoomEventSchema.parse({
        type: "artifact.created",
        roomId: input.roomId,
        eventId: artifactEvent.id,
        artifact: serializedArtifact,
        ts: artifactEvent.occurredAt.toISOString()
      })
    ]
  };
}

export async function createTask(
  server: FastifyInstance,
  input: CreateTaskInput
): Promise<{ task: RealtimeTask; event: RealtimeRoomEvent }> {
  const task = await server.db.task.create({
    data: {
      roomId: input.roomId,
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      assignedAgentId: input.assignedAgentId ?? input.createdByAgentId ?? null,
      title: input.title,
      description: input.description ?? null,
      status: "PENDING",
      riskLevel: input.riskLevel ?? "LOW"
    }
  });
  const serializedTask = serializeTask(task);
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: task.id,
    type: "task.created",
    payload: {
      task: serializedTask
    }
  });

  return {
    task: serializedTask,
    event: realtimeRoomEventSchema.parse({
      type: "task.created",
      roomId: input.roomId,
      eventId: taskEvent.id,
      task: serializedTask,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function createArtifactForTask(
  server: FastifyInstance,
  input: CreateArtifactInput
): Promise<{ artifact: RealtimeArtifact; event: RealtimeRoomEvent } | null> {
  const task = await findTaskInRoom(server, input.roomId, input.taskId);

  if (!task) {
    return null;
  }

  const artifact = await server.db.artifact.create({
    data: {
      roomId: input.roomId,
      taskId: input.taskId,
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      type: input.type,
      status: "DRAFT",
      title: input.title
    }
  });
  const version = await server.db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      createdByUserId: input.createdByUserId ?? null,
      createdByAgentId: input.createdByAgentId ?? null,
      version: 1,
      content: input.content as Prisma.InputJsonValue
    }
  });
  const serializedArtifact = serializeArtifact({
    ...artifact,
    versions: [version]
  });
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: input.taskId,
    type: "artifact.created",
    payload: {
      artifact: serializedArtifact
    }
  });

  return {
    artifact: serializedArtifact,
    event: realtimeRoomEventSchema.parse({
      type: "artifact.created",
      roomId: input.roomId,
      eventId: taskEvent.id,
      artifact: serializedArtifact,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function listRoomTaskState(server: FastifyInstance, roomId: string): Promise<RoomTaskState[]> {
  const tasks = await server.db.task.findMany({
    where: {
      roomId
    },
    include: {
      artifacts: {
        include: {
          versions: {
            orderBy: {
              version: "desc"
            },
            take: 1
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      events: {
        where: {
          type: "task.log"
        },
        orderBy: {
          occurredAt: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return (tasks as TaskWithArtifactsRecord[]).map((task) => ({
    task: serializeTask(task),
    artifacts: task.artifacts.map(serializeArtifact),
    logs: (task.events ?? []).map(serializeTaskLogEvent).filter(isPresent)
  }));
}

export async function updateTaskStatus(
  server: FastifyInstance,
  input: {
    roomId: string;
    taskId: string;
    status: TaskStatus;
  }
): Promise<{ task: RealtimeTask; event: RealtimeRoomEvent } | null> {
  const existingTask = await findTaskInRoom(server, input.roomId, input.taskId);

  if (!existingTask) {
    return null;
  }

  const task = await server.db.task.update({
    where: {
      id: existingTask.id
    },
    data: {
      status: input.status,
      completedAt: isTerminalTaskStatus(input.status) ? new Date() : null
    }
  });
  const serializedTask = serializeTask(task);
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: input.taskId,
    type: "task.status",
    payload: {
      task: serializedTask
    }
  });

  return {
    task: serializedTask,
    event: realtimeRoomEventSchema.parse({
      type: "task.status",
      roomId: input.roomId,
      eventId: taskEvent.id,
      task: serializedTask,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function claimTaskForAgent(
  server: FastifyInstance,
  input: {
    roomId: string;
    taskId: string;
    agentId: string;
  }
): Promise<{ task: RealtimeTask; event: RealtimeRoomEvent } | null> {
  const existingTask = await findTaskInRoom(server, input.roomId, input.taskId);

  if (!existingTask) {
    return null;
  }

  const task = await server.db.task.update({
    where: {
      id: existingTask.id
    },
    data: {
      assignedAgentId: input.agentId,
      status: "RUNNING",
      completedAt: null
    }
  });
  const serializedTask = serializeTask(task);
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: input.taskId,
    type: "task.status",
    payload: {
      task: serializedTask
    }
  });

  return {
    task: serializedTask,
    event: realtimeRoomEventSchema.parse({
      type: "task.status",
      roomId: input.roomId,
      eventId: taskEvent.id,
      task: serializedTask,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function appendTaskLog(
  server: FastifyInstance,
  input: {
    roomId: string;
    taskId: string;
    message: string;
  }
): Promise<{ log: RealtimeTaskLog; event: RealtimeRoomEvent } | null> {
  const task = await findTaskInRoom(server, input.roomId, input.taskId);

  if (!task) {
    return null;
  }

  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: input.taskId,
    type: "task.log",
    payload: {
      message: input.message
    }
  });
  const log = serializeTaskLog(taskEvent, input.message);

  return {
    log,
    event: realtimeRoomEventSchema.parse({
      type: "task.log",
      roomId: input.roomId,
      eventId: taskEvent.id,
      taskId: input.taskId,
      log,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function updateArtifact(
  server: FastifyInstance,
  input: {
    roomId: string;
    artifactId: string;
    title?: string;
    status?: ArtifactStatus;
    content?: Record<string, unknown>;
  }
): Promise<{ artifact: RealtimeArtifact; event: RealtimeRoomEvent } | null> {
  const existingArtifact = await findArtifactInRoom(server, input.roomId, input.artifactId);

  if (!existingArtifact?.taskId) {
    return null;
  }

  const latestVersion = existingArtifact.versions[0] ?? null;
  const artifactData: { title?: string; status?: ArtifactStatus } = {};

  if (input.title !== undefined) {
    artifactData.title = input.title;
  }

  if (input.status !== undefined) {
    artifactData.status = input.status;
  }

  if (input.content !== undefined && Object.keys(artifactData).length === 0) {
    artifactData.status = existingArtifact.status as ArtifactStatus;
  }

  const artifact =
    Object.keys(artifactData).length > 0
      ? await server.db.artifact.update({
          where: {
            id: existingArtifact.id
          },
          data: artifactData
        })
      : existingArtifact;
  const version =
    input.content === undefined
      ? latestVersion
      : await createNextArtifactVersion(server, {
          artifact: existingArtifact,
          content: input.content,
          latestVersion
        });
  const serializedArtifact = serializeArtifact({
    ...artifact,
    versions: version ? [version] : []
  });
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: existingArtifact.taskId,
    type: "artifact.updated",
    payload: {
      artifact: serializedArtifact
    }
  });

  return {
    artifact: serializedArtifact,
    event: realtimeRoomEventSchema.parse({
      type: "artifact.updated",
      roomId: input.roomId,
      eventId: taskEvent.id,
      artifact: serializedArtifact,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function patchArtifact(
  server: FastifyInstance,
  input: {
    roomId: string;
    artifactId: string;
    patch: Record<string, unknown>;
  }
): Promise<{ artifact: RealtimeArtifact; event: RealtimeRoomEvent } | null> {
  const existingArtifact = await findArtifactInRoom(server, input.roomId, input.artifactId);

  if (!existingArtifact?.taskId) {
    return null;
  }

  const artifact = await server.db.artifact.update({
    where: {
      id: existingArtifact.id
    },
    data: {
      status: existingArtifact.status as ArtifactStatus
    }
  });
  const latestVersion = existingArtifact.versions[0] ?? null;
  const content = {
    ...(latestVersion ? normalizeContent(latestVersion.content) : {}),
    ...input.patch
  };
  const version = await createNextArtifactVersion(server, {
    artifact: existingArtifact,
    content,
    latestVersion
  });
  const serializedArtifact = serializeArtifact({
    ...artifact,
    versions: [version]
  });
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: existingArtifact.taskId,
    type: "artifact.patch",
    payload: {
      artifact: serializedArtifact,
      patch: input.patch
    }
  });

  return {
    artifact: serializedArtifact,
    event: realtimeRoomEventSchema.parse({
      type: "artifact.patch",
      roomId: input.roomId,
      eventId: taskEvent.id,
      artifact: serializedArtifact,
      patch: input.patch,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function updateArtifactPreviewUrl(
  server: FastifyInstance,
  input: {
    roomId: string;
    artifactId: string;
    previewUrl: string;
  }
): Promise<{ artifact: RealtimeArtifact; event: RealtimeRoomEvent } | null> {
  const existingArtifact = await findArtifactInRoom(server, input.roomId, input.artifactId);

  if (!existingArtifact?.taskId) {
    return null;
  }

  const artifact = await server.db.artifact.update({
    where: {
      id: existingArtifact.id
    },
    data: {
      status: existingArtifact.status as ArtifactStatus
    }
  });
  const latestVersion = existingArtifact.versions[0] ?? null;
  const content = {
    ...(latestVersion ? normalizeContent(latestVersion.content) : {}),
    previewUrl: input.previewUrl
  };
  const version = await createNextArtifactVersion(server, {
    artifact: existingArtifact,
    content,
    latestVersion
  });
  const serializedArtifact = serializeArtifact({
    ...artifact,
    versions: [version]
  });
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: existingArtifact.taskId,
    type: "artifact.preview_url",
    payload: {
      artifact: serializedArtifact,
      previewUrl: input.previewUrl
    }
  });

  return {
    artifact: serializedArtifact,
    event: realtimeRoomEventSchema.parse({
      type: "artifact.preview_url",
      roomId: input.roomId,
      eventId: taskEvent.id,
      artifact: serializedArtifact,
      previewUrl: input.previewUrl,
      ts: taskEvent.occurredAt.toISOString()
    })
  };
}

export async function listReplayEvents(
  server: FastifyInstance,
  input: {
    roomId: string;
    afterEventId?: string;
    since?: Date;
    limit: number;
  }
): Promise<RealtimeRoomEvent[]> {
  let cursorDate: Date | null = null;

  if (input.afterEventId) {
    const cursor = (await server.db.taskEvent.findUnique({
      where: {
        id: input.afterEventId
      }
    })) as TaskEventRecord | null;

    if (cursor) {
      if (cursor.roomId !== input.roomId) {
        return [];
      }

      cursorDate = cursor.occurredAt;
    } else {
      const auditEvents = (await server.db.auditLog.findMany({
        where: {
          roomId: input.roomId
        },
        orderBy: {
          createdAt: "asc"
        }
      })) as AuditLogRecord[];
      const auditCursor = auditEvents.find((event) => event.id === input.afterEventId);

      if (!auditCursor) {
        return [];
      }

      cursorDate = auditCursor.createdAt;
    }

    const taskEvents = (await server.db.taskEvent.findMany({
      where: {
        roomId: input.roomId,
        ...(cursorDate && !cursor
          ? {
              occurredAt: {
                gt: cursorDate
              }
            }
          : {})
      },
      orderBy: [
        {
          occurredAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      ...(cursor
        ? {
            cursor: {
              id: cursor.id
            },
            skip: 1
          }
        : {}),
      take: input.limit
    })) as TaskEventRecord[];
    const auditEvents = (await server.db.auditLog.findMany({
      where: {
        roomId: input.roomId,
        ...(cursorDate
          ? {
              createdAt: {
                gt: cursorDate
              }
            }
          : {})
      },
      orderBy: {
        createdAt: "asc"
      }
    })) as AuditLogRecord[];

    return sortReplayEvents([
      ...taskEvents.map(replayEventFromTaskEvent).filter(isPresent),
      ...auditEvents.map(replayEventFromAuditLog).filter(isPresent)
    ]).slice(0, input.limit);
  }

  const [taskEvents, auditEvents] = await Promise.all([
    server.db.taskEvent.findMany({
      where: {
        roomId: input.roomId,
        ...(input.since
          ? {
              occurredAt: {
                gt: input.since
              }
            }
          : {})
      },
      orderBy: [
        {
          occurredAt: "asc"
        },
        {
          id: "asc"
        }
      ],
      take: input.limit
    }) as Promise<TaskEventRecord[]>,
    server.db.auditLog.findMany({
      where: {
        roomId: input.roomId,
        ...(input.since
          ? {
              createdAt: {
                gt: input.since
              }
            }
          : {})
      },
      orderBy: {
        createdAt: "asc"
      }
    }) as Promise<AuditLogRecord[]>
  ]);

  return sortReplayEvents([
    ...taskEvents.map(replayEventFromTaskEvent).filter(isPresent),
    ...auditEvents.map(replayEventFromAuditLog).filter(isPresent)
  ]).slice(0, input.limit);
}

export async function createAgentSpeechEvent(
  server: FastifyInstance,
  input: {
    roomId: string;
    taskId: string;
    agentId: string;
    text: string;
  }
): Promise<RealtimeRoomEvent> {
  const taskEvent = await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: input.taskId,
    type: "agent.speech",
    payload: {
      agentId: input.agentId,
      text: input.text
    }
  });

  return realtimeRoomEventSchema.parse({
    type: "agent.speech",
    roomId: input.roomId,
    eventId: taskEvent.id,
    agentId: input.agentId,
    text: input.text,
    ts: taskEvent.occurredAt.toISOString()
  });
}

export function serializeTask(task: TaskRecord): RealtimeTask {
  return {
    id: task.id,
    roomId: task.roomId,
    createdByUserId: task.createdByUserId,
    createdByAgentId: task.createdByAgentId,
    assignedAgentId: task.assignedAgentId,
    title: task.title,
    description: task.description,
    status: task.status as RealtimeTask["status"],
    riskLevel: task.riskLevel as RealtimeTask["riskLevel"],
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null
  };
}

export function serializeArtifact(artifact: ArtifactRecord): RealtimeArtifact {
  const latestVersion = artifact.versions?.[0] ?? null;

  return {
    id: artifact.id,
    roomId: artifact.roomId,
    taskId: artifact.taskId,
    createdByUserId: artifact.createdByUserId,
    createdByAgentId: artifact.createdByAgentId,
    type: artifact.type as RealtimeArtifact["type"],
    status: artifact.status as RealtimeArtifact["status"],
    title: artifact.title,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
    latestVersion: latestVersion
      ? {
          id: latestVersion.id,
          version: latestVersion.version,
          content: normalizeContent(latestVersion.content),
          createdAt: latestVersion.createdAt.toISOString()
        }
      : null
  };
}

async function recordTaskEvent(
  server: FastifyInstance,
  input: {
    roomId: string;
    taskId: string;
    type: string;
    payload: Record<string, unknown>;
  }
): Promise<TaskEventRecord> {
  return server.db.taskEvent.create({
    data: {
      ...input,
      payload: input.payload as Prisma.InputJsonValue
    }
  }) as Promise<TaskEventRecord>;
}

function normalizeContent(content: unknown): Record<string, unknown> {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }

  return {
    value: content
  };
}

function serializeTaskLogEvent(event: TaskEventRecord): RealtimeTaskLog | null {
  const payload = normalizeContent(event.payload);

  if (isRecord(payload.log) && typeof payload.log.message === "string") {
    return {
      id: typeof payload.log.id === "string" ? payload.log.id : event.id,
      roomId: typeof payload.log.roomId === "string" ? payload.log.roomId : event.roomId,
      taskId: typeof payload.log.taskId === "string" ? payload.log.taskId : event.taskId,
      message: payload.log.message,
      createdAt: typeof payload.log.createdAt === "string" ? payload.log.createdAt : event.occurredAt.toISOString()
    };
  }

  if (typeof payload.message !== "string") {
    return null;
  }

  return serializeTaskLog(event, payload.message);
}

function serializeTaskLog(event: TaskEventRecord, message: string): RealtimeTaskLog {
  return {
    id: event.id,
    roomId: event.roomId,
    taskId: event.taskId,
    message,
    createdAt: event.occurredAt.toISOString()
  };
}

async function findTaskInRoom(server: FastifyInstance, roomId: string, taskId: string): Promise<TaskRecord | null> {
  return server.db.task.findFirst({
    where: {
      id: taskId,
      roomId
    }
  }) as Promise<TaskRecord | null>;
}

async function findArtifactInRoom(
  server: FastifyInstance,
  roomId: string,
  artifactId: string
): Promise<ArtifactWithVersionsRecord | null> {
  return server.db.artifact.findFirst({
    where: {
      id: artifactId,
      roomId
    },
    include: {
      versions: {
        orderBy: {
          version: "desc"
        },
        take: 1
      }
    }
  }) as Promise<ArtifactWithVersionsRecord | null>;
}

async function createNextArtifactVersion(
  server: FastifyInstance,
  input: {
    artifact: ArtifactRecord;
    content: Record<string, unknown>;
    latestVersion: ArtifactVersionRecord | null;
  }
): Promise<ArtifactVersionRecord> {
  return server.db.artifactVersion.create({
    data: {
      artifactId: input.artifact.id,
      createdByUserId: input.artifact.createdByUserId,
      createdByAgentId: input.artifact.createdByAgentId,
      version: (input.latestVersion?.version ?? 0) + 1,
      content: input.content as Prisma.InputJsonValue
    }
  }) as Promise<ArtifactVersionRecord>;
}

function replayEventFromTaskEvent(taskEvent: TaskEventRecord): RealtimeRoomEvent | null {
  const payload = normalizeContent(taskEvent.payload);
  const base = {
    roomId: taskEvent.roomId,
    eventId: taskEvent.id,
    ts: taskEvent.occurredAt.toISOString()
  };

  try {
    if ((taskEvent.type === "task.created" || taskEvent.type === "task.status") && isRecord(payload.task)) {
      return realtimeRoomEventSchema.parse({
        ...base,
        type: taskEvent.type,
        task: payload.task
      });
    }

    if (taskEvent.type === "task.log") {
      const log = serializeTaskLogEvent(taskEvent);

      if (!log) {
        return null;
      }

      return realtimeRoomEventSchema.parse({
        ...base,
        type: "task.log",
        taskId: taskEvent.taskId,
        log
      });
    }

    if (
      (taskEvent.type === "artifact.created" ||
        taskEvent.type === "artifact.updated" ||
        taskEvent.type === "artifact.patch" ||
        taskEvent.type === "artifact.preview_url") &&
      isRecord(payload.artifact)
    ) {
      return realtimeRoomEventSchema.parse({
        ...base,
        type: taskEvent.type,
        artifact: payload.artifact,
        ...(taskEvent.type === "artifact.patch" ? { patch: normalizeContent(payload.patch) } : {}),
        ...(taskEvent.type === "artifact.preview_url" && typeof payload.previewUrl === "string"
          ? { previewUrl: payload.previewUrl }
          : {})
      });
    }

    if (taskEvent.type === "agent.speech" && typeof payload.agentId === "string" && typeof payload.text === "string") {
      return realtimeRoomEventSchema.parse({
        ...base,
        type: "agent.speech",
        agentId: payload.agentId,
        text: payload.text
      });
    }
  } catch {
    return null;
  }

  return null;
}

function replayEventFromAuditLog(auditLog: AuditLogRecord): RealtimeRoomEvent | null {
  if (!auditLog.roomId) {
    return null;
  }

  const payload = normalizeContent(auditLog.payload);

  try {
    const event = roomEventSchema.parse({
      id: auditLog.id,
      roomId: auditLog.roomId,
      type: auditLog.action,
      occurredAt: auditLog.createdAt.toISOString(),
      actorUserId: auditLog.actorUserId,
      actorAgentId: auditLog.actorAgentId,
      taskId: readPayloadId(payload, "taskId"),
      artifactId: readPayloadId(payload, "artifactId"),
      approvalId: readPayloadId(payload, "approvalId"),
      payload
    });

    return realtimeRoomEventSchema.parse({
      type: "room.event",
      roomId: event.roomId,
      eventId: event.id,
      event,
      ts: event.occurredAt
    });
  } catch {
    return null;
  }
}

function sortReplayEvents(events: RealtimeRoomEvent[]): RealtimeRoomEvent[] {
  return [...events].sort((left, right) => {
    const timeDiff = new Date(left.ts).getTime() - new Date(right.ts).getTime();

    if (timeDiff !== 0) {
      return timeDiff;
    }

    return (left.eventId ?? "").localeCompare(right.eventId ?? "");
  });
}

function readPayloadId(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];

  return typeof value === "string" ? value : null;
}

function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
