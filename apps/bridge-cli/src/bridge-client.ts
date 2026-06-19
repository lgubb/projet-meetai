import {
  bridgeProtocolVersion,
  bridgeServerMessageSchema,
  type BridgeClientMessage,
  type BridgeServerMessage
} from "@jean/shared";

import type { BridgeAgentConfig, BridgeConfig, BridgeSessionState } from "./config.js";
import { LocalAgentRunner } from "./agents.js";
import { callRoomMcpTool } from "./workroom-http.js";

const openState = 1;
const heartbeatIntervalMs = 1000 * 15;
const reconnectMaxDelayMs = 1000 * 15;

type RuntimeWebSocket = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: "open", listener: () => void): void;
  addEventListener(event: "close", listener: () => void): void;
  addEventListener(event: "error", listener: (event: unknown) => void): void;
  addEventListener(event: "message", listener: (event: { data: unknown }) => void): void;
};

type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocket;

type RunningRequest = {
  taskId: string;
  canceled: boolean;
};

export async function startBridge(config: BridgeConfig, sessions: Record<string, BridgeSessionState>): Promise<void> {
  const clients = config.agents.map((agent) => {
    const session = sessions[`${config.apiUrl}|${config.roomId}|${agent.localAgentKey}`];

    if (!session) {
      throw new Error(`Missing session for ${agent.localAgentKey}. Run jean-bridge login first.`);
    }

    return new BridgeClient(config, agent, session);
  });

  const stop = () => {
    for (const client of clients) {
      client.stop();
    }
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  await Promise.all(clients.map((client) => client.start()));
}

class BridgeClient {
  private readonly runner: LocalAgentRunner;
  private readonly runningRequests = new Map<string, RunningRequest>();
  private stopped = false;
  private socket: RuntimeWebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: BridgeConfig,
    private readonly agent: BridgeAgentConfig,
    private readonly session: BridgeSessionState
  ) {
    this.runner = new LocalAgentRunner(agent, session);
  }

  async start(): Promise<void> {
    let reconnectDelayMs = 1000;

    while (!this.stopped) {
      try {
        await this.connectOnce();
        reconnectDelayMs = 1000;
      } catch (error) {
        console.error(`[${this.agent.localAgentKey}] bridge connection failed: ${errorMessage(error)}`);
      }

      if (!this.stopped) {
        await delay(reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, reconnectMaxDelayMs);
      }
    }
  }

  stop(): void {
    this.stopped = true;
    this.stopHeartbeat();

    if (this.socket?.readyState === openState) {
      this.socket.close(1000, "Bridge stopped.");
    }
  }

  private connectOnce(): Promise<void> {
    const WebSocketConstructor = getRuntimeWebSocket();
    const socket = new WebSocketConstructor(buildBridgeUrl(this.config, this.session));
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let opened = false;

      socket.addEventListener("open", () => {
        opened = true;
        console.log(`[${this.agent.localAgentKey}] connected to ${this.config.wsUrl}`);
        this.send({
          type: "bridge.hello",
          protocolVersion: bridgeProtocolVersion,
          bridgeId: this.config.bridgeId,
          roomId: this.config.roomId,
          agent: {
            localAgentKey: this.agent.localAgentKey,
            agentId: this.session.agentId,
            name: this.agent.name,
            provider: this.agent.provider,
            transport: this.agent.transport,
            capabilities: this.agent.capabilities,
            metadata: {
              ...this.agent.metadata,
              bridgeConfigPath: this.config.path
            }
          },
          runConfig: {
            timeoutMs: this.agent.timeoutMs
          }
        });
        this.startHeartbeat();
      });
      socket.addEventListener("message", (event) => {
        void this.handleServerMessage(event.data);
      });
      socket.addEventListener("close", () => {
        this.stopHeartbeat();
        this.socket = null;
        resolve();
      });
      socket.addEventListener("error", (event) => {
        if (!opened) {
          reject(new Error(`WebSocket error before open: ${String(event)}`));
          return;
        }

        console.error(`[${this.agent.localAgentKey}] WebSocket error: ${String(event)}`);
      });
    });
  }

  private async handleServerMessage(rawData: unknown): Promise<void> {
    const message = bridgeServerMessageSchema.parse(JSON.parse(String(rawData))) as BridgeServerMessage;

    if (message.type === "bridge.ready") {
      console.log(`[${this.agent.localAgentKey}] registered as ${message.agentId}`);
      return;
    }

    if (message.type === "bridge.ping") {
      return;
    }

    if (message.type === "bridge.error") {
      console.error(`[${this.agent.localAgentKey}] server error: ${message.error}`);
      return;
    }

    if (message.type === "bridge.task.cancel") {
      this.cancelTask(message.requestId, message.taskId, message.reason ?? "Canceled by server.");
      return;
    }

    if (message.type === "bridge.local_action.run") {
      await this.runLocalAction(message);
      return;
    }

    await this.runTask(message);
  }

  private async runTask(message: Extract<BridgeServerMessage, { type: "bridge.task.run" }>): Promise<void> {
    this.runningRequests.set(message.requestId, {
      taskId: message.taskId,
      canceled: false
    });
    this.send({
      type: "bridge.task.accepted",
      requestId: message.requestId,
      taskId: message.taskId,
      ts: new Date().toISOString()
    });

    try {
      const result = await this.runner.run(message);
      const runningRequest = this.runningRequests.get(message.requestId);

      if (runningRequest?.canceled) {
        return;
      }

      this.send({
        type: "bridge.task.completed",
        requestId: message.requestId,
        taskId: message.taskId,
        summary: result.summary,
        metadata: result.metadata,
        ts: new Date().toISOString()
      });
    } catch (error) {
      const runningRequest = this.runningRequests.get(message.requestId);

      if (runningRequest?.canceled) {
        return;
      }

      this.send({
        type: "bridge.task.failed",
        requestId: message.requestId,
        taskId: message.taskId,
        error: errorMessage(error),
        metadata: {
          localAgentKey: this.agent.localAgentKey
        },
        ts: new Date().toISOString()
      });
    } finally {
      this.runningRequests.delete(message.requestId);
    }
  }

  private cancelTask(requestId: string, taskId: string, reason: string): void {
    const runningRequest = this.runningRequests.get(requestId);

    if (runningRequest) {
      runningRequest.canceled = true;
    }

    this.runner.cancel(requestId, reason);
    this.send({
      type: "bridge.task.canceled",
      requestId,
      taskId,
      reason,
      ts: new Date().toISOString()
    });
  }

  private async runLocalAction(message: Extract<BridgeServerMessage, { type: "bridge.local_action.run" }>): Promise<void> {
    this.send({
      type: "bridge.local_action.accepted",
      requestId: message.requestId,
      actionType: message.actionType,
      artifactId: message.artifactId,
      ts: new Date().toISOString()
    });

    try {
      const result = await this.runner.runLocalAction(message);

      this.send({
        type: "bridge.local_action.completed",
        requestId: message.requestId,
        actionType: message.actionType,
        artifactId: message.artifactId,
        summary: result.summary,
        metadata: result.metadata,
        ts: new Date().toISOString()
      });
    } catch (error) {
      this.send({
        type: "bridge.local_action.failed",
        requestId: message.requestId,
        actionType: message.actionType,
        artifactId: message.artifactId,
        error: errorMessage(error),
        metadata: {
          localAgentKey: this.agent.localAgentKey
        },
        ts: new Date().toISOString()
      });
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: "bridge.heartbeat",
        ts: new Date().toISOString()
      });
      void callRoomMcpTool({
        mcpHttpUrl: new URL(`/rooms/${this.config.roomId}/mcp`, this.config.apiUrl).toString(),
        token: this.session.token,
        toolName: "agent.heartbeat",
        arguments: {
          roomId: this.config.roomId,
          agentId: this.session.agentId
        }
      }).catch((error) => {
        console.error(`[${this.agent.localAgentKey}] heartbeat failed: ${errorMessage(error)}`);
      });
    }, heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(message: BridgeClientMessage): void {
    if (!this.socket || this.socket.readyState !== openState) {
      throw new Error("Bridge WebSocket is not open.");
    }

    this.socket.send(JSON.stringify(message));
  }
}

function buildBridgeUrl(config: BridgeConfig, session: BridgeSessionState): string {
  const url = new URL(`/rooms/${config.roomId}/bridge`, config.wsUrl);

  url.searchParams.set("token", session.token);

  return url.toString();
}

function getRuntimeWebSocket(): RuntimeWebSocketConstructor {
  const runtime = globalThis as unknown as { WebSocket?: RuntimeWebSocketConstructor };

  if (!runtime.WebSocket) {
    throw new Error("This Node.js runtime does not expose WebSocket. Use Node.js 22.12 or newer.");
  }

  return runtime.WebSocket;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown bridge error.";
}
