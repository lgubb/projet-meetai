import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { HttpError, notFound } from "../errors.js";
import { createRoomAgentSession } from "../room-mcp-service.js";
import { issueRoomAgentToken } from "../room-agent-auth.js";

type LocalAgentPairingStatus = "PENDING" | "CONSUMED" | "CODEX_AUTH_ERROR" | "BRIDGE_ERROR" | "EXPIRED";

type LocalAgentPairingRecord = {
  id: string;
  roomId: string;
  createdByUserId: string;
  agentId: string | null;
  codeHash: string;
  status: LocalAgentPairingStatus;
  errorMessage: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const codexLocalAgent = {
  localAgentKey: "codex",
  name: "Codex Local",
  provider: "CODEX" as const,
  transport: "mcp_stdio" as const,
  capabilities: ["CODE_GENERATION", "PROTOTYPING"] as const,
  command: "codex",
  args: ["mcp-server"],
  framing: "jsonl" as const,
  cwd: null,
  timeoutMs: 1000 * 60 * 15,
  metadata: {
    bridge: "jean-bridge",
    localAgentKey: "codex",
    localTransport: "mcp_stdio",
    codexAuth: "local"
  },
  checks: {},
  codex: {
    approvalPolicy: "never" as const,
    sandbox: "workspace-write" as const
  }
};

const pairingTtlMs = 1000 * 60 * 10;

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const pairingCodeParamsSchema = z
  .object({
    code: z.string().min(1)
  })
  .strict();

const pairingStatusQuerySchema = z
  .object({
    code: z.string().min(1).optional()
  })
  .strict();

const pairingErrorBodySchema = z
  .object({
    status: z.enum(["CODEX_AUTH_ERROR", "BRIDGE_ERROR"]),
    message: z.string().min(1).max(1000)
  })
  .strict();

export function registerLocalCodexRoutes(server: FastifyInstance): void {
  server.post("/rooms/:roomId/local-codex/pairing-codes", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + pairingTtlMs);
    const pairing = (await server.db.localAgentPairingCode.create({
      data: {
        roomId: params.roomId,
        createdByUserId: user.id,
        codeHash: hashPairingCode(code),
        status: "PENDING",
        expiresAt
      }
    })) as LocalAgentPairingRecord;
    const apiUrl = getPublicApiUrl(request);

    return reply.code(201).send({
      status: "pairing_pending",
      pairing: serializePairing(pairing, {
        code,
        command: buildPairCommand(apiUrl, code)
      })
    });
  });

  server.get("/rooms/:roomId/local-codex/status", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const query = pairingStatusQuerySchema.parse(request.query);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return buildLocalCodexStatus(server, params.roomId, query.code);
  });

  server.post("/local-codex/pairing-codes/:code/consume", async (request, reply) => {
    const params = pairingCodeParamsSchema.parse(request.params);
    const pairing = await requirePendingPairing(server, params.code);
    const session = await createRoomAgentSession(server, {
      roomId: pairing.roomId,
      name: codexLocalAgent.name,
      provider: codexLocalAgent.provider,
      transport: "STDIO",
      capabilities: [...codexLocalAgent.capabilities],
      metadata: {
        ...codexLocalAgent.metadata,
        pairingId: pairing.id,
        pairedByUserId: pairing.createdByUserId
      }
    });
    const token = issueRoomAgentToken({
      roomId: pairing.roomId,
      agentId: session.agent.id,
      sessionId: session.connectionId,
      ownerUserId: pairing.createdByUserId
    });

    await server.db.localAgentPairingCode.update({
      where: {
        id: pairing.id
      },
      data: {
        agentId: session.agent.id,
        consumedAt: new Date(),
        errorMessage: null,
        status: "CONSUMED"
      }
    });

    return reply.code(201).send({
      roomId: pairing.roomId,
      agent: codexLocalAgent,
      session: {
        apiUrl: getPublicApiUrl(request),
        roomId: pairing.roomId,
        localAgentKey: codexLocalAgent.localAgentKey,
        agentId: session.agent.id,
        agentName: session.agent.name,
        token,
        tokenType: "Bearer",
        createdAt: new Date().toISOString()
      }
    });
  });

  server.post("/local-codex/pairing-codes/:code/error", async (request) => {
    const params = pairingCodeParamsSchema.parse(request.params);
    const body = pairingErrorBodySchema.parse(request.body);
    const pairing = await findPairingByCode(server, params.code);

    if (!pairing) {
      notFound("Pairing code not found.");
    }

    const normalizedPairing = await normalizeExpiredPairing(server, pairing);

    if (normalizedPairing.status === "PENDING") {
      const nextPairing = (await server.db.localAgentPairingCode.update({
        where: {
          id: normalizedPairing.id
        },
        data: {
          errorMessage: body.message,
          status: body.status
        }
      })) as LocalAgentPairingRecord;

      return {
        pairing: serializePairing(nextPairing)
      };
    }

    return {
      pairing: serializePairing(normalizedPairing)
    };
  });
}

async function buildLocalCodexStatus(server: FastifyInstance, roomId: string, code?: string) {
  const connected = server.localAgentBridge
    .getConnections(roomId)
    .find((connection) => connection.agent.provider === "CODEX");

  if (connected) {
    return {
      status: "connected",
      connection: connected
    };
  }

  const pairing = code
    ? await findPairingByCode(server, code)
    : ((await server.db.localAgentPairingCode.findFirst({
        where: {
          roomId
        },
        orderBy: {
          createdAt: "desc"
        }
      })) as LocalAgentPairingRecord | null);

  if (!pairing || pairing.roomId !== roomId) {
    return {
      status: "not_connected"
    };
  }

  const normalizedPairing = await normalizeExpiredPairing(server, pairing);

  return {
    status: statusForPairing(normalizedPairing),
    pairing: serializePairing(normalizedPairing)
  };
}

async function requirePendingPairing(server: FastifyInstance, code: string): Promise<LocalAgentPairingRecord> {
  const pairing = await findPairingByCode(server, code);

  if (!pairing) {
    notFound("Pairing code not found.");
  }

  const normalizedPairing = await normalizeExpiredPairing(server, pairing);

  if (normalizedPairing.status !== "PENDING") {
    throw new HttpError(409, `Pairing code is ${normalizedPairing.status.toLowerCase()}.`);
  }

  return normalizedPairing;
}

async function findPairingByCode(
  server: FastifyInstance,
  code: string
): Promise<LocalAgentPairingRecord | null> {
  return (await server.db.localAgentPairingCode.findUnique({
    where: {
      codeHash: hashPairingCode(code)
    }
  })) as LocalAgentPairingRecord | null;
}

async function normalizeExpiredPairing(
  server: FastifyInstance,
  pairing: LocalAgentPairingRecord
): Promise<LocalAgentPairingRecord> {
  if (pairing.status !== "PENDING" || pairing.expiresAt.getTime() > Date.now()) {
    return pairing;
  }

  return (await server.db.localAgentPairingCode.update({
    where: {
      id: pairing.id
    },
    data: {
      status: "EXPIRED"
    }
  })) as LocalAgentPairingRecord;
}

function serializePairing(
  pairing: LocalAgentPairingRecord,
  secret?: {
    code: string;
    command: string;
  }
) {
  return {
    id: pairing.id,
    status: pairing.status,
    expiresAt: pairing.expiresAt.toISOString(),
    consumedAt: pairing.consumedAt?.toISOString() ?? null,
    errorMessage: pairing.errorMessage,
    ...(secret
      ? {
          code: secret.code,
          command: secret.command
        }
      : {})
  };
}

function statusForPairing(pairing: LocalAgentPairingRecord): string {
  if (pairing.status === "PENDING" || pairing.status === "CONSUMED") {
    return "pairing_pending";
  }

  if (pairing.status === "CODEX_AUTH_ERROR") {
    return "codex_auth_error";
  }

  if (pairing.status === "BRIDGE_ERROR") {
    return "bridge_error";
  }

  if (pairing.status === "EXPIRED") {
    return "expired";
  }

  return "not_connected";
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

function createPairingCode(): string {
  return `jcp_${randomBytes(18).toString("base64url")}`;
}

function hashPairingCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function buildPairCommand(apiUrl: string, code: string): string {
  return `pnpm --filter @jean/bridge-cli dev pair --api-url ${shellQuote(apiUrl)} --code ${shellQuote(code)}`;
}

function getPublicApiUrl(request: FastifyRequest): string {
  const configuredUrl = process.env.WORKROOM_PUBLIC_API_URL ?? process.env.WORKROOM_API_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const forwardedProto = readHeader(request, "x-forwarded-proto");
  const forwardedHost = readHeader(request, "x-forwarded-host");
  const host = forwardedHost ?? readHeader(request, "host") ?? "127.0.0.1:3001";
  const protocol = forwardedProto ?? "http";

  return `${protocol}://${host}`.replace(/\/$/, "");
}

function readHeader(request: FastifyRequest, key: string): string | null {
  const value = request.headers[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:.=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}
