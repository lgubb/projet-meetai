import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { bridgeClientHelloMessageSchema, type BridgeClientMessage } from "@jean/shared";
import { z } from "zod";

import { forbidden } from "../errors.js";
import { requireRoomAgentParticipant } from "../room-mcp-service.js";
import { verifyRoomAgentToken } from "../room-agent-auth.js";

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const bridgeQuerySchema = z
  .object({
    token: z.string().min(1)
  })
  .strict();

export function registerBridgeRoutes(server: FastifyInstance): void {
  server.get("/rooms/:roomId/bridge", { websocket: true }, async (socket, request) => {
    void acceptBridgeSocket(server, socket, request.params, request.query);
  });
}

async function acceptBridgeSocket(
  server: FastifyInstance,
  socket: WebSocket,
  rawParams: unknown,
  rawQuery: unknown
): Promise<void> {
    try {
      const params = roomParamsSchema.parse(rawParams);
      const query = bridgeQuerySchema.parse(rawQuery);
      const claims = verifyRoomAgentToken(query.token);

      if (claims.roomId !== params.roomId) {
        forbidden("Room agent token is not scoped to this room.");
      }

      const helloPromise = readBridgeHello(socket);
      const [, hello] = await Promise.all([requireRoomAgentParticipant(server, claims), helloPromise]);

      if (hello.roomId !== claims.roomId || hello.agent.agentId !== claims.agentId) {
        socket.close(1008, "Bridge hello does not match token claims.");
        return;
      }

      server.localAgentBridge.register({
        socket,
        roomId: claims.roomId,
        bridgeId: hello.bridgeId,
        agent: hello.agent,
        runConfig: hello.runConfig
      });
    } catch (error) {
      server.log.warn(error);
      socket.close(1008, "Bridge connection rejected.");
    }
}

function readBridgeHello(socket: WebSocket): Promise<Extract<BridgeClientMessage, { type: "bridge.hello" }>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for bridge hello."));
    }, 5000);

    const onMessage = (rawMessage: Buffer) => {
      cleanup();

      try {
        resolve(bridgeClientHelloMessageSchema.parse(JSON.parse(rawMessage.toString())));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Invalid bridge hello."));
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Bridge closed before hello."));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Bridge errored before hello."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
      socket.off("error", onError);
    };

    socket.once("message", onMessage);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
}
