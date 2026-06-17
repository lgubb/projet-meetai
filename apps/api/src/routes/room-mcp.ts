import type { FastifyInstance } from "fastify";
import { agentCapabilitySchema, agentTransportSchema, metadataSchema } from "@jean/shared";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { notFound } from "../errors.js";
import { issueRoomAgentToken, requireRoomAgentToken } from "../room-agent-auth.js";
import {
  createRoomAgentSession,
  handleRoomMcpJsonRpc,
  listRoomAgents,
  listRoomApprovals,
  resolveRoomApproval
} from "../room-mcp-service.js";

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const approvalParamsSchema = z
  .object({
    roomId: z.string().min(1),
    approvalId: z.string().min(1)
  })
  .strict();

const apiAgentProviderSchema = z.enum(["NATIVE", "MCP", "CODEX", "LOVABLE", "PERPLEXITY", "E2B"]);

const createAgentSessionBodySchema = z
  .object({
    name: z.string().min(1),
    provider: apiAgentProviderSchema.default("MCP"),
    transport: agentTransportSchema.default("HTTP"),
    capabilities: z.array(agentCapabilitySchema).min(1).default(["TASK_PLANNING"]),
    metadata: metadataSchema.optional()
  })
  .strict();

const approvalDecisionBodySchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED", "CANCELED"])
  })
  .strict();

export function registerRoomMcpRoutes(server: FastifyInstance): void {
  server.post("/rooms/:roomId/agent-sessions", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const body = createAgentSessionBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const session = await createRoomAgentSession(server, {
      roomId: params.roomId,
      name: body.name,
      provider: body.provider,
      transport: body.transport,
      capabilities: body.capabilities,
      metadata: body.metadata
    });
    const token = issueRoomAgentToken({
      roomId: params.roomId,
      agentId: session.agent.id,
      sessionId: session.connectionId
    });

    return reply.code(201).send({
      agent: session.agent,
      session: {
        token,
        tokenType: "Bearer"
      }
    });
  });

  server.get("/rooms/:roomId/agents", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      agents: await listRoomAgents(server, params.roomId)
    };
  });

  server.get("/rooms/:roomId/approvals", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      approvals: await listRoomApprovals(server, params.roomId)
    };
  });

  server.post("/rooms/:roomId/approvals/:approvalId/decision", async (request) => {
    const params = approvalParamsSchema.parse(request.params);
    const body = approvalDecisionBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      approval: await resolveRoomApproval(server, {
        roomId: params.roomId,
        approvalId: params.approvalId,
        status: body.status,
        decidedByUserId: user.id
      })
    };
  });

  server.post("/rooms/:roomId/mcp", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const claims = requireRoomAgentToken(request, params.roomId);

    return handleRoomMcpJsonRpc(server, claims, request.body);
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
