import type { FastifyInstance } from "fastify";
import { agentCapabilitySchema, agentProviderSchema, agentTransportSchema, metadataSchema, taskRiskLevelSchema } from "@jean/shared";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { forbidden, notFound } from "../errors.js";
import { listOrganizationPolicyRules, updateOrganizationPolicyRuleOverride } from "../policy-guard.js";
import { issueRoomAgentToken, requireRoomAgentToken } from "../room-agent-auth.js";
import {
  createRoomAgentSession,
  handleRoomMcpJsonRpc,
  listRoomAgents,
  listRoomApprovals,
  listRoomToolCalls,
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

const policyRuleParamsSchema = z
  .object({
    roomId: z.string().min(1),
    ruleId: z.string().min(1)
  })
  .strict();

const createAgentSessionBodySchema = z
  .object({
    name: z.string().min(1),
    provider: agentProviderSchema.default("MCP"),
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

const updatePolicyRuleBodySchema = z
  .object({
    riskLevel: taskRiskLevelSchema
  })
  .strict();

export function registerRoomMcpRoutes(server: FastifyInstance): void {
  server.post("/rooms/:roomId/agent-sessions", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const body = createAgentSessionBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);

    await requireAgentSessionPermission(server, room, user.id);

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
      sessionId: session.connectionId,
      ownerUserId: user.id
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

  server.get("/rooms/:roomId/tool-calls", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      toolCalls: await listRoomToolCalls(server, params.roomId)
    };
  });

  server.get("/rooms/:roomId/policy", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);
    const approvalDecisionPermission = await getApprovalDecisionPermission(server, room, user.id);
    const agentSessionPermission = await getAgentSessionPermission(server, room, user.id);
    const policyRulePermission = await getPolicyRulePermission(server, room, user.id);

    return {
      policy: {
        roomId: params.roomId,
        agentSessions: agentSessionPermission,
        approvalDecisions: approvalDecisionPermission,
        policyRules: policyRulePermission,
        rules: await listOrganizationPolicyRules(server.db, room.organizationId)
      }
    };
  });

  server.patch("/rooms/:roomId/policy/rules/:ruleId", async (request) => {
    const params = policyRuleParamsSchema.parse(request.params);
    const body = updatePolicyRuleBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);

    await requirePolicyRulePermission(server, room, user.id);

    const rule = await updateOrganizationPolicyRuleOverride(server.db, {
      organizationId: room.organizationId,
      ruleId: params.ruleId,
      riskLevel: body.riskLevel,
      updatedByUserId: user.id
    });

    if (!rule) {
      notFound("Policy rule not found.");
    }

    return {
      rule
    };
  });

  server.post("/rooms/:roomId/approvals/:approvalId/decision", async (request) => {
    const params = approvalParamsSchema.parse(request.params);
    const body = approvalDecisionBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);

    await requireApprovalDecisionPermission(server, room, user.id);

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

async function requireApprovalDecisionPermission(
  server: FastifyInstance,
  room: { id: string; organizationId: string },
  userId: string
): Promise<void> {
  const permission = await getApprovalDecisionPermission(server, room, userId);

  if (permission.canDecide) {
    return;
  }

  forbidden("Approval decisions require an organization admin or room host.");
}

async function requireAgentSessionPermission(
  server: FastifyInstance,
  room: { id: string; organizationId: string },
  userId: string
): Promise<void> {
  const permission = await getAgentSessionPermission(server, room, userId);

  if (permission.canCreate) {
    return;
  }

  forbidden("Agent sessions require an organization admin or room host.");
}

async function requirePolicyRulePermission(
  server: FastifyInstance,
  room: { id: string; organizationId: string },
  userId: string
): Promise<void> {
  const permission = await getPolicyRulePermission(server, room, userId);

  if (permission.canManage) {
    return;
  }

  forbidden("Policy rules require an organization admin.");
}

async function getApprovalDecisionPermission(
  server: FastifyInstance,
  room: { id: string; organizationId: string },
  userId: string
) {
  const permission = await getPrivilegedRoomUserPermission(server, room, userId);

  return {
    ...permission,
    canDecide: canUsePrivilegedRoomAction(permission)
  };
}

async function getAgentSessionPermission(
  server: FastifyInstance,
  room: { id: string; organizationId: string },
  userId: string
) {
  const permission = await getPrivilegedRoomUserPermission(server, room, userId);

  return {
    ...permission,
    canCreate: canUsePrivilegedRoomAction(permission)
  };
}

async function getPolicyRulePermission(
  server: FastifyInstance,
  room: { organizationId: string },
  userId: string
) {
  const membership = await server.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: room.organizationId,
        userId
      }
    }
  });

  return {
    allowedOrganizationRoles: ["OWNER", "ADMIN"],
    canManage: membership?.role === "OWNER" || membership?.role === "ADMIN",
    organizationRole: membership?.role ?? null
  };
}

async function getPrivilegedRoomUserPermission(
  server: FastifyInstance,
  room: { id: string; organizationId: string },
  userId: string
) {
  const membership = await server.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: room.organizationId,
        userId
      }
    }
  });

  const participant = await server.db.roomParticipant.findUnique({
    where: {
      roomId_userId: {
        roomId: room.id,
        userId
      }
    }
  });

  return {
    allowedOrganizationRoles: ["OWNER", "ADMIN"],
    allowedRoomRoles: ["HOST"],
    organizationRole: membership?.role ?? null,
    roomRole: participant?.role ?? null
  };
}

function canUsePrivilegedRoomAction(permission: { organizationRole: string | null; roomRole: string | null }): boolean {
  return permission.organizationRole === "OWNER" || permission.organizationRole === "ADMIN" || permission.roomRole === "HOST";
}
