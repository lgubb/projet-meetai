import type { FastifyInstance } from "fastify";
import { roomTemplateIdSchema, type ArtifactType, type RoomTemplateId } from "@jean/shared";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { forbidden, notFound } from "../errors.js";
import type { LiveKitTokenIssuer } from "../livekit.js";
import { createTaskWithArtifact } from "../room-task-service.js";

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
    title: z.string().min(1),
    templateId: roomTemplateIdSchema.default("blank")
  })
  .strict();

const updateRoomBodySchema = z
  .object({
    title: z.string().min(1)
  })
  .strict();

const liveKitTokenBodySchema = z.object({}).strict();

const alphaUsageLimits = {
  rooms: readAlphaUsageLimit("WORKROOM_ALPHA_MAX_ROOMS", 25),
  tasks: readAlphaUsageLimit("WORKROOM_ALPHA_MAX_TASKS", 200),
  artifacts: readAlphaUsageLimit("WORKROOM_ALPHA_MAX_ARTIFACTS", 200),
  agents: readAlphaUsageLimit("WORKROOM_ALPHA_MAX_AGENTS", 20),
  approvals: readAlphaUsageLimit("WORKROOM_ALPHA_MAX_APPROVALS", 250),
  toolCalls: readAlphaUsageLimit("WORKROOM_ALPHA_MAX_TOOL_CALLS", 1000)
};

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

  server.get("/organizations/:organizationId/usage", async (request) => {
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
    const roomUsage = await Promise.all(
      rooms.map(async (room) => {
        const [tasks, artifacts, approvals, toolCalls, participants, transcripts, sandboxSessions] = await Promise.all([
          server.db.task.findMany({
            where: {
              roomId: room.id
            }
          }),
          server.db.artifact.findMany({
            where: {
              roomId: room.id
            }
          }),
          server.db.approval.findMany({
            where: {
              roomId: room.id
            }
          }),
          server.db.agentToolCall.findMany({
            where: {
              roomId: room.id
            }
          }),
          server.db.roomParticipant.findMany({
            where: {
              roomId: room.id
            }
          }),
          server.db.transcriptSegment.findMany({
            where: {
              roomId: room.id
            }
          }),
          server.db.sandboxSession.findMany({
            where: {
              roomId: room.id
            }
          })
        ]);

        return {
          room,
          tasks,
          artifacts,
          approvals,
          toolCalls,
          participants,
          transcripts,
          sandboxSessions
        };
      })
    );
    const agents = await server.db.agent.findMany({
      where: {
        organizationId: params.organizationId
      }
    });
    const tasks = roomUsage.flatMap((usage) => usage.tasks);
    const artifacts = roomUsage.flatMap((usage) => usage.artifacts);
    const approvals = roomUsage.flatMap((usage) => usage.approvals);
    const toolCalls = roomUsage.flatMap((usage) => usage.toolCalls);

    return {
      usage: {
        organizationId: params.organizationId,
        rooms: summarizeRooms(rooms),
        tasks: summarizeTasks(tasks),
        artifacts: summarizeArtifacts(artifacts),
        agents: {
          total: agents.length
        },
        approvals: summarizeApprovals(approvals),
        toolCalls: summarizeToolCalls(toolCalls),
        providerUsage: summarizeProviderUsage(roomUsage),
        limits: summarizeUsageLimits({
          rooms: rooms.length,
          tasks: tasks.length,
          artifacts: artifacts.length,
          agents: agents.length,
          approvals: approvals.length,
          toolCalls: toolCalls.length
        })
      }
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

    await seedRoomTemplate(server, {
      roomId: room.id,
      userId: user.id,
      templateId: body.templateId
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

    await ensureOrganizationMember(server, room.organizationId, user.id);

    const participant = await ensureRoomParticipant(server, room.id, user.id);

    return reply.code(201).send({
      room: serializeRoom(room),
      participant: serializeParticipant(participant)
    });
  });
}

async function ensureOrganizationMember(
  server: FastifyInstance,
  organizationId: string,
  userId: string
): Promise<void> {
  try {
    await server.db.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId,
          userId
        }
      },
      create: {
        organizationId,
        userId,
        role: "MEMBER"
      },
      update: {}
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }
}

async function ensureRoomParticipant(server: FastifyInstance, roomId: string, userId: string) {
  try {
    return await server.db.roomParticipant.upsert({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      create: {
        roomId,
        userId,
        role: "MEMBER"
      },
      update: {
        leftAt: null
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const participant = await server.db.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      }
    });

    if (!participant) {
      throw error;
    }

    return participant;
  }
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

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
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

function summarizeRooms(rooms: Array<{ status: string }>) {
  return {
    total: rooms.length,
    created: countStatus(rooms, "CREATED"),
    live: countStatus(rooms, "LIVE"),
    ended: countStatus(rooms, "ENDED"),
    archived: countStatus(rooms, "ARCHIVED")
  };
}

function summarizeTasks(tasks: Array<{ status: string }>) {
  return {
    total: tasks.length,
    pending: countStatus(tasks, "PENDING"),
    running: countStatus(tasks, "RUNNING"),
    waitingForApproval: countStatus(tasks, "WAITING_FOR_APPROVAL"),
    completed: countStatus(tasks, "COMPLETED"),
    failed: countStatus(tasks, "FAILED"),
    canceled: countStatus(tasks, "CANCELED")
  };
}

function summarizeArtifacts(artifacts: Array<{ status: string; type: string }>) {
  return {
    total: artifacts.length,
    draft: countStatus(artifacts, "DRAFT"),
    generating: countStatus(artifacts, "GENERATING"),
    ready: countStatus(artifacts, "READY"),
    failed: countStatus(artifacts, "FAILED"),
    archived: countStatus(artifacts, "ARCHIVED"),
    previews: artifacts.filter((artifact) => artifact.type === "PREVIEW").length
  };
}

function summarizeApprovals(approvals: Array<{ status: string }>) {
  return {
    total: approvals.length,
    pending: countStatus(approvals, "PENDING"),
    approved: countStatus(approvals, "APPROVED"),
    rejected: countStatus(approvals, "REJECTED"),
    canceled: countStatus(approvals, "CANCELED")
  };
}

function summarizeToolCalls(toolCalls: Array<{ status: string }>) {
  return {
    total: toolCalls.length,
    running: countStatus(toolCalls, "RUNNING"),
    succeeded: countStatus(toolCalls, "SUCCEEDED"),
    failed: countStatus(toolCalls, "FAILED"),
    blocked: countStatus(toolCalls, "BLOCKED")
  };
}

function summarizeProviderUsage(
  roomUsage: Array<{
    room: { endedAt: Date | null };
    participants: Array<{ joinedAt: Date; leftAt: Date | null }>;
    transcripts: Array<{ startedAt: Date; endedAt: Date | null }>;
    sandboxSessions: Array<{ provider: string; createdAt: Date; updatedAt: Date }>;
    toolCalls: Array<{ status: string }>;
  }>
) {
  let liveKitParticipantMs = 0;
  let deepgramSttMs = 0;
  let e2bSandboxMs = 0;
  let connectorFailures = 0;

  for (const usage of roomUsage) {
    for (const participant of usage.participants) {
      const endedAt = participant.leftAt ?? usage.room.endedAt;

      if (endedAt) {
        liveKitParticipantMs += positiveDurationMs(participant.joinedAt, endedAt);
      }
    }

    for (const transcript of usage.transcripts) {
      if (transcript.endedAt) {
        deepgramSttMs += positiveDurationMs(transcript.startedAt, transcript.endedAt);
      }
    }

    for (const session of usage.sandboxSessions) {
      if (session.provider === "E2B") {
        e2bSandboxMs += positiveDurationMs(session.createdAt, session.updatedAt);
      }
    }

    connectorFailures += usage.toolCalls.filter((toolCall) => toolCall.status === "FAILED").length;
  }

  return {
    liveKitParticipantMinutes: toRoundedMinutes(liveKitParticipantMs),
    deepgramSttMinutes: toRoundedMinutes(deepgramSttMs),
    e2bSandboxMinutes: toRoundedMinutes(e2bSandboxMs),
    connectorFailures
  };
}

function countStatus(items: Array<{ status: string }>, status: string): number {
  return items.filter((item) => item.status === status).length;
}

function summarizeUsageLimits(used: {
  rooms: number;
  tasks: number;
  artifacts: number;
  agents: number;
  approvals: number;
  toolCalls: number;
}) {
  return {
    rooms: createUsageLimit(used.rooms, alphaUsageLimits.rooms),
    tasks: createUsageLimit(used.tasks, alphaUsageLimits.tasks),
    artifacts: createUsageLimit(used.artifacts, alphaUsageLimits.artifacts),
    agents: createUsageLimit(used.agents, alphaUsageLimits.agents),
    approvals: createUsageLimit(used.approvals, alphaUsageLimits.approvals),
    toolCalls: createUsageLimit(used.toolCalls, alphaUsageLimits.toolCalls)
  };
}

function createUsageLimit(used: number, limit: number) {
  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    isOverLimit: used > limit
  };
}

function positiveDurationMs(startedAt: Date, endedAt: Date): number {
  return Math.max(endedAt.getTime() - startedAt.getTime(), 0);
}

function toRoundedMinutes(durationMs: number): number {
  return Math.round(durationMs / 600) / 100;
}

function readAlphaUsageLimit(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return fallback;
}

type StarterTaskTemplate = {
  title: string;
  description: string;
  artifact: {
    title: string;
    type: ArtifactType;
    content: Record<string, unknown>;
  };
};

const starterTasksByTemplate: Record<Exclude<RoomTemplateId, "blank">, StarterTaskTemplate> = {
  product_jam: {
    title: "Capture product decisions",
    description: "Turn the session into decisions, open questions, owners, and next steps.",
    artifact: {
      title: "Product jam brief",
      type: "DOCUMENT",
      content: {
        text: "Use this brief to capture the product jam outcome.",
        sections: [
          "Goal and customer context",
          "Decisions made",
          "Open questions",
          "Owners and next steps"
        ]
      }
    }
  },
  research_call: {
    title: "Synthesize research call",
    description: "Collect questions, signals, quotes, objections, and follow-ups from the call.",
    artifact: {
      title: "Research call synthesis",
      type: "RESEARCH",
      content: {
        text: "Use this synthesis to separate evidence from interpretation.",
        sections: [
          "Participant profile",
          "Research questions",
          "Key signals",
          "Notable quotes",
          "Follow-up actions"
        ]
      }
    }
  },
  prototype_session: {
    title: "Frame prototype direction",
    description: "Define the target flow, assumptions, acceptance criteria, and prototype tasks.",
    artifact: {
      title: "Prototype session brief",
      type: "PREVIEW",
      content: {
        text: "Use this brief before generating or applying prototype files.",
        sections: [
          "Target user flow",
          "Core interaction",
          "Design constraints",
          "Acceptance criteria",
          "Prototype task list"
        ]
      }
    }
  }
};

async function seedRoomTemplate(
  server: FastifyInstance,
  input: {
    roomId: string;
    userId: string;
    templateId: RoomTemplateId;
  }
): Promise<void> {
  if (input.templateId === "blank") {
    return;
  }

  const starterTask = starterTasksByTemplate[input.templateId];

  await createTaskWithArtifact(server, {
    roomId: input.roomId,
    createdByUserId: input.userId,
    title: starterTask.title,
    description: starterTask.description,
    artifact: starterTask.artifact
  });
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
