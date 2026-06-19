import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

import { getAuthMode } from "./auth.js";
import { forbidden, unauthorized } from "./errors.js";

export type RoomAgentTokenClaims = {
  roomId: string;
  agentId: string;
  sessionId: string;
  ownerUserId: string | null;
  issuedAt: string;
  expiresAt: string;
};

const tokenPrefix = "room_agent_";
const tokenTtlMs = 1000 * 60 * 60 * 24;

export function issueRoomAgentToken(input: {
  roomId: string;
  agentId: string;
  sessionId: string;
  ownerUserId?: string | null;
  now?: Date;
}): string {
  const issuedAt = input.now ?? new Date();
  const claims: RoomAgentTokenClaims = {
    roomId: input.roomId,
    agentId: input.agentId,
    sessionId: input.sessionId,
    ownerUserId: input.ownerUserId ?? null,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + tokenTtlMs).toISOString()
  };
  const payload = encodeBase64Url(JSON.stringify(claims));
  const signature = signPayload(payload);

  return `${tokenPrefix}${payload}.${signature}`;
}

export function requireRoomAgentToken(request: FastifyRequest, roomId: string): RoomAgentTokenClaims {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    unauthorized("Missing room agent bearer token.");
  }

  const claims = verifyRoomAgentToken(authorization.slice("Bearer ".length));

  if (claims.roomId !== roomId) {
    forbidden("Room agent token is not scoped to this room.");
  }

  return claims;
}

export function verifyRoomAgentToken(token: string, now = new Date()): RoomAgentTokenClaims {
  if (!token.startsWith(tokenPrefix)) {
    unauthorized("Invalid room agent token.");
  }

  const [payload, signature] = token.slice(tokenPrefix.length).split(".");

  if (!payload || !signature || !verifySignature(payload, signature)) {
    unauthorized("Invalid room agent token.");
  }

  const claims = parseClaims(payload);

  if (new Date(claims.expiresAt).getTime() <= now.getTime()) {
    unauthorized("Expired room agent token.");
  }

  return claims;
}

function parseClaims(payload: string): RoomAgentTokenClaims {
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<RoomAgentTokenClaims>;

    if (
      typeof parsed.roomId === "string" &&
      typeof parsed.agentId === "string" &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.issuedAt === "string" &&
      typeof parsed.expiresAt === "string"
    ) {
      return {
        roomId: parsed.roomId,
        agentId: parsed.agentId,
        sessionId: parsed.sessionId,
        ownerUserId: typeof parsed.ownerUserId === "string" ? parsed.ownerUserId : null,
        issuedAt: parsed.issuedAt,
        expiresAt: parsed.expiresAt
      };
    }
  } catch {
    unauthorized("Invalid room agent token.");
  }

  unauthorized("Invalid room agent token.");
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = signPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function signPayload(payload: string): string {
  return createHmac("sha256", getRoomAgentTokenSecret()).update(payload).digest("base64url");
}

function getRoomAgentTokenSecret(): string {
  const secret = process.env.WORKROOM_AGENT_TOKEN_SECRET;

  if (secret) {
    return secret;
  }

  if (getAuthMode() === "dev") {
    return "dev-room-agent-token-secret";
  }

  throw new Error("WORKROOM_AGENT_TOKEN_SECRET is required outside dev auth mode.");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
