import type { FastifyInstance } from "fastify";
import type { Prisma } from "@jean/db";
import {
  realtimeRoomEventSchema,
  type ArtifactType,
  type RealtimeArtifact,
  type RealtimeRoomEvent,
  type RealtimeTask
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

export type TaskArtifactBundle = {
  task: RealtimeTask;
  artifact: RealtimeArtifact;
  events: [RealtimeRoomEvent, RealtimeRoomEvent];
};

export type RoomTaskState = {
  task: RealtimeTask;
  artifacts: RealtimeArtifact[];
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

type TaskWithArtifactsRecord = TaskRecord & {
  artifacts: ArtifactRecord[];
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

  await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: task.id,
    type: "task.created",
    payload: {
      title: task.title
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

  await recordTaskEvent(server, {
    roomId: input.roomId,
    taskId: task.id,
    type: "artifact.created",
    payload: {
      artifactId: artifact.id,
      title: artifact.title,
      type: artifact.type
    }
  });

  const serializedTask = serializeTask(task);
  const serializedArtifact = serializeArtifact({
    ...artifact,
    versions: [version]
  });
  const ts = new Date().toISOString();

  return {
    task: serializedTask,
    artifact: serializedArtifact,
    events: [
      realtimeRoomEventSchema.parse({
        type: "task.created",
        roomId: input.roomId,
        task: serializedTask,
        ts
      }),
      realtimeRoomEventSchema.parse({
        type: "artifact.created",
        roomId: input.roomId,
        artifact: serializedArtifact,
        ts
      })
    ]
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
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return (tasks as TaskWithArtifactsRecord[]).map((task) => ({
    task: serializeTask(task),
    artifacts: task.artifacts.map(serializeArtifact)
  }));
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
  await recordTaskEvent(server, {
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
    agentId: input.agentId,
    text: input.text,
    ts: new Date().toISOString()
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
): Promise<void> {
  await server.db.taskEvent.create({
    data: {
      ...input,
      payload: input.payload as Prisma.InputJsonValue
    }
  });
}

function normalizeContent(content: unknown): Record<string, unknown> {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }

  return {
    value: content
  };
}
