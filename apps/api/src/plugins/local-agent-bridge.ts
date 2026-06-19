import type { FastifyInstance } from "fastify";

import { LocalAgentBridgeBroker } from "../local-agent-bridge.js";

declare module "fastify" {
  interface FastifyInstance {
    localAgentBridge: LocalAgentBridgeBroker;
  }
}

export function registerLocalAgentBridge(
  server: FastifyInstance,
  broker = new LocalAgentBridgeBroker()
): void {
  server.decorate("localAgentBridge", broker);
  server.addHook("onClose", async () => {
    broker.close();
  });
}
