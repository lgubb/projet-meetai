import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  bridgeProtocolVersion,
  bridgeClientMessageSchema,
  bridgeServerMessageSchema,
  type AgentCapability,
  type AgentProvider,
  type ArtifactType,
  type BridgeAgentDescriptor,
  type BridgeClientMessage,
  type BridgeLocalActionRunMessage,
  type BridgeRunConfig,
  type BridgeTaskRunMessage,
  type BridgeTaskType
} from "@jean/shared";

const webSocketOpenState = 1;
const defaultRunTimeoutMs = 1000 * 60 * 15;
const pingIntervalMs = 1000 * 20;

export type BridgeTaskDispatchInput = {
  roomId: string;
  taskId: string;
  artifactId: string;
  title: string;
  description: string | null;
  taskType: BridgeTaskType;
  artifactType: ArtifactType;
  objective: string;
  mcpHttpUrl: string;
  requiredCapability: AgentCapability;
  allowedProviders?: AgentProvider[];
  preferredProvider?: AgentProvider;
  timeoutMs?: number;
  onAccepted?: () => void;
};

export type BridgeTaskDispatchResult = {
  requestId: string;
  taskId: string;
  agent: BridgeAgentDescriptor;
  summary: string | null;
  metadata: Record<string, unknown>;
};

export type BridgeLocalActionDispatchInput = {
  roomId: string;
  artifactId: string;
  requiredCapability: AgentCapability;
  allowedProviders?: AgentProvider[];
  preferredProvider?: AgentProvider;
  timeoutMs?: number;
  onAccepted?: () => void;
} & (
  | {
      actionType: "apply_artifact_files";
      files: Extract<BridgeLocalActionRunMessage, { actionType: "apply_artifact_files" }>["files"];
    }
  | {
      actionType: "run_check";
      checkName: string;
    }
);

export type BridgeLocalActionDispatchResult = {
  requestId: string;
  artifactId: string;
  agent: BridgeAgentDescriptor;
  summary: string | null;
  metadata: Record<string, unknown>;
};

export type BridgeConnectionSnapshot = {
  roomId: string;
  agent: BridgeAgentDescriptor;
  connectedAt: string;
  lastHeartbeatAt: string;
  busyTaskId: string | null;
};

type BridgeConnection = {
  key: string;
  socket: WebSocket;
  roomId: string;
  bridgeId: string;
  agent: BridgeAgentDescriptor;
  runConfig: BridgeRunConfig;
  connectedAt: Date;
  lastHeartbeatAt: Date;
  pingTimer: NodeJS.Timeout;
};

type PendingRun = {
  requestId: string;
  taskId: string;
  connectionKey: string;
  accepted: boolean;
  onAccepted?: () => void;
  timeout: NodeJS.Timeout;
  resolve: (result: BridgeTaskDispatchResult) => void;
  reject: (error: Error) => void;
};

type PendingLocalAction = {
  requestId: string;
  artifactId: string;
  connectionKey: string;
  accepted: boolean;
  onAccepted?: () => void;
  timeout: NodeJS.Timeout;
  resolve: (result: BridgeLocalActionDispatchResult) => void;
  reject: (error: Error) => void;
};

export class LocalAgentBridgeBroker {
  private readonly connections = new Map<string, BridgeConnection>();
  private readonly pendingLocalActions = new Map<string, PendingLocalAction>();
  private readonly pendingRuns = new Map<string, PendingRun>();
  private readonly pendingRunIdsByTaskKey = new Map<string, string>();

  register(input: {
    socket: WebSocket;
    roomId: string;
    bridgeId: string;
    agent: BridgeAgentDescriptor;
    runConfig: BridgeRunConfig;
  }): BridgeConnectionSnapshot {
    const key = connectionKey(input.roomId, input.agent.agentId);
    const existingConnection = this.connections.get(key);

    if (existingConnection) {
      this.closeConnection(existingConnection, 4000, "Bridge agent reconnected.");
    }

    const now = new Date();
    const connection: BridgeConnection = {
      key,
      socket: input.socket,
      roomId: input.roomId,
      bridgeId: input.bridgeId,
      agent: input.agent,
      runConfig: input.runConfig,
      connectedAt: now,
      lastHeartbeatAt: now,
      pingTimer: setInterval(() => {
        this.send(connection, {
          type: "bridge.ping",
          ts: new Date().toISOString()
        });
      }, pingIntervalMs)
    };

    this.connections.set(key, connection);
    input.socket.on("message", (rawMessage) => {
      this.handleRawClientMessage(connection, rawMessage.toString());
    });
    input.socket.once("close", () => {
      this.unregister(connection, new BridgeConnectionClosedError("Bridge connection closed."));
    });
    input.socket.once("error", () => {
      this.unregister(connection, new BridgeConnectionClosedError("Bridge connection errored."));
    });
    this.send(connection, {
      type: "bridge.ready",
      protocolVersion: bridgeProtocolVersion,
      roomId: input.roomId,
      agentId: input.agent.agentId,
      ts: now.toISOString()
    });

    return this.snapshot(connection);
  }

  getConnections(roomId?: string): BridgeConnectionSnapshot[] {
    return [...this.connections.values()]
      .filter((connection) => !roomId || connection.roomId === roomId)
      .map((connection) => this.snapshot(connection));
  }

  hasAvailableAgent(input: {
    roomId: string;
    requiredCapability: AgentCapability;
    allowedProviders?: AgentProvider[];
    preferredProvider?: AgentProvider;
  }): boolean {
    return this.findAvailableConnection(input) !== null;
  }

  dispatchTask(input: BridgeTaskDispatchInput): Promise<BridgeTaskDispatchResult> {
    const connection = this.findAvailableConnection(input);

    if (!connection) {
      return Promise.reject(new BridgeUnavailableError("No connected local bridge agent can handle this task."));
    }

    const requestId = randomUUID();
    const timeoutMs = Math.min(input.timeoutMs ?? defaultRunTimeoutMs, connection.runConfig.timeoutMs);
    const runMessage: BridgeTaskRunMessage = {
      type: "bridge.task.run",
      requestId,
      roomId: input.roomId,
      taskId: input.taskId,
      artifactId: input.artifactId,
      title: input.title,
      description: input.description,
      taskType: input.taskType,
      artifactType: input.artifactType,
      objective: input.objective,
      mcpHttpUrl: input.mcpHttpUrl,
      timeoutMs,
      ts: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRuns.delete(requestId);
        this.pendingRunIdsByTaskKey.delete(taskKey(input.roomId, input.taskId));
        this.send(connection, {
          type: "bridge.task.cancel",
          requestId,
          taskId: input.taskId,
          reason: "Task timed out.",
          ts: new Date().toISOString()
        });
        reject(new BridgeTaskTimeoutError(`Bridge task timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingRuns.set(requestId, {
        requestId,
        taskId: input.taskId,
        connectionKey: connection.key,
        accepted: false,
        onAccepted: input.onAccepted,
        timeout,
        resolve,
        reject
      });
      this.pendingRunIdsByTaskKey.set(taskKey(input.roomId, input.taskId), requestId);

      try {
        this.send(connection, runMessage);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRuns.delete(requestId);
        this.pendingRunIdsByTaskKey.delete(taskKey(input.roomId, input.taskId));
        reject(error instanceof Error ? error : new Error("Failed to send bridge task."));
      }
    });
  }

  dispatchLocalAction(input: BridgeLocalActionDispatchInput): Promise<BridgeLocalActionDispatchResult> {
    const connection = this.findAvailableConnection(input);

    if (!connection) {
      return Promise.reject(new BridgeUnavailableError("No connected local bridge agent can handle this action."));
    }

    const requestId = randomUUID();
    const timeoutMs = Math.min(input.timeoutMs ?? defaultRunTimeoutMs, connection.runConfig.timeoutMs);
    const actionMessage: BridgeLocalActionRunMessage =
      input.actionType === "apply_artifact_files"
        ? {
            type: "bridge.local_action.run",
            requestId,
            roomId: input.roomId,
            artifactId: input.artifactId,
            actionType: input.actionType,
            files: input.files,
            timeoutMs,
            ts: new Date().toISOString()
          }
        : {
            type: "bridge.local_action.run",
            requestId,
            roomId: input.roomId,
            artifactId: input.artifactId,
            actionType: input.actionType,
            checkName: input.checkName,
            timeoutMs,
            ts: new Date().toISOString()
          };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingLocalActions.delete(requestId);
        reject(new BridgeTaskTimeoutError(`Bridge local action timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pendingLocalActions.set(requestId, {
        requestId,
        artifactId: input.artifactId,
        connectionKey: connection.key,
        accepted: false,
        onAccepted: input.onAccepted,
        timeout,
        resolve,
        reject
      });

      try {
        this.send(connection, actionMessage);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingLocalActions.delete(requestId);
        reject(error instanceof Error ? error : new Error("Failed to send bridge local action."));
      }
    });
  }

  cancelTask(roomId: string, taskId: string, reason: string): boolean {
    const requestId = this.pendingRunIdsByTaskKey.get(taskKey(roomId, taskId));

    if (!requestId) {
      return false;
    }

    const pending = this.pendingRuns.get(requestId);

    if (!pending) {
      return false;
    }

    const connection = this.connections.get(pending.connectionKey);

    if (connection) {
      this.send(connection, {
        type: "bridge.task.cancel",
        requestId,
        taskId,
        reason,
        ts: new Date().toISOString()
      });
    }

    clearTimeout(pending.timeout);
    this.pendingRuns.delete(requestId);
    this.pendingRunIdsByTaskKey.delete(taskKey(roomId, taskId));
    pending.reject(new BridgeTaskCanceledError(reason));

    return true;
  }

  close(): void {
    for (const connection of this.connections.values()) {
      this.closeConnection(connection, 1001, "Server shutting down.");
    }

    this.connections.clear();
  }

  private findAvailableConnection(input: {
    roomId: string;
    requiredCapability: AgentCapability;
    allowedProviders?: AgentProvider[];
    preferredProvider?: AgentProvider;
  }): BridgeConnection | null {
    const allowedProviders = input.allowedProviders ? new Set(input.allowedProviders) : null;
    const candidates = [...this.connections.values()]
      .filter((connection) => connection.roomId === input.roomId)
      .filter((connection) => connection.socket.readyState === webSocketOpenState)
      .filter((connection) => connection.agent.capabilities.includes(input.requiredCapability))
      .filter((connection) => !allowedProviders || allowedProviders.has(connection.agent.provider))
      .filter((connection) => !this.isConnectionBusy(connection.key));
    const preferred = candidates.find((connection) => connection.agent.provider === input.preferredProvider);

    return preferred ?? candidates[0] ?? null;
  }

  private isConnectionBusy(connectionKeyValue: string): boolean {
    return (
      [...this.pendingRuns.values()].some((run) => run.connectionKey === connectionKeyValue) ||
      [...this.pendingLocalActions.values()].some((action) => action.connectionKey === connectionKeyValue)
    );
  }

  private handleRawClientMessage(connection: BridgeConnection, rawMessage: string): void {
    let message: BridgeClientMessage;

    try {
      message = bridgeClientMessageSchema.parse(JSON.parse(rawMessage));
    } catch {
      this.send(connection, {
        type: "bridge.error",
        error: "Invalid bridge message.",
        ts: new Date().toISOString()
      });
      return;
    }

    this.handleClientMessage(connection, message);
  }

  private handleClientMessage(connection: BridgeConnection, message: BridgeClientMessage): void {
    if (message.type === "bridge.hello") {
      this.send(connection, {
        type: "bridge.error",
        error: "Bridge hello was already accepted.",
        ts: new Date().toISOString()
      });
      return;
    }

    if (message.type === "bridge.heartbeat") {
      connection.lastHeartbeatAt = new Date(message.ts);
      return;
    }

    if (
      message.type === "bridge.local_action.accepted" ||
      message.type === "bridge.local_action.completed" ||
      message.type === "bridge.local_action.failed"
    ) {
      this.handleLocalActionClientMessage(connection, message);
      return;
    }

    const pending = this.pendingRuns.get(message.requestId);

    if (!pending || pending.taskId !== message.taskId) {
      return;
    }

    if (message.type === "bridge.task.accepted") {
      if (!pending.accepted) {
        pending.accepted = true;
        pending.onAccepted?.();
      }

      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRuns.delete(message.requestId);
    this.pendingRunIdsByTaskKey.delete(taskKey(connection.roomId, message.taskId));

    if (message.type === "bridge.task.completed") {
      pending.resolve({
        requestId: message.requestId,
        taskId: message.taskId,
        agent: connection.agent,
        summary: message.summary,
        metadata: message.metadata
      });
      return;
    }

    if (message.type === "bridge.task.canceled") {
      pending.reject(new BridgeTaskCanceledError(message.reason ?? "Bridge task canceled."));
      return;
    }

    pending.reject(new BridgeTaskFailedError(message.error));
  }

  private handleLocalActionClientMessage(
    connection: BridgeConnection,
    message: Extract<
      BridgeClientMessage,
      { type: "bridge.local_action.accepted" | "bridge.local_action.completed" | "bridge.local_action.failed" }
    >
  ): void {
    const pending = this.pendingLocalActions.get(message.requestId);

    if (!pending || pending.artifactId !== message.artifactId) {
      return;
    }

    if (message.type === "bridge.local_action.accepted") {
      if (!pending.accepted) {
        pending.accepted = true;
        pending.onAccepted?.();
      }

      return;
    }

    clearTimeout(pending.timeout);
    this.pendingLocalActions.delete(message.requestId);

    if (message.type === "bridge.local_action.completed") {
      pending.resolve({
        requestId: message.requestId,
        artifactId: message.artifactId,
        agent: connection.agent,
        summary: message.summary,
        metadata: message.metadata
      });
      return;
    }

    pending.reject(new BridgeTaskFailedError(message.error));
  }

  private unregister(connection: BridgeConnection, error: Error): void {
    if (this.connections.get(connection.key) !== connection) {
      return;
    }

    clearInterval(connection.pingTimer);
    this.connections.delete(connection.key);

    for (const pending of this.pendingRuns.values()) {
      if (pending.connectionKey !== connection.key) {
        continue;
      }

      clearTimeout(pending.timeout);
      this.pendingRuns.delete(pending.requestId);
      this.pendingRunIdsByTaskKey.delete(taskKey(connection.roomId, pending.taskId));
      pending.reject(error);
    }

    for (const pending of this.pendingLocalActions.values()) {
      if (pending.connectionKey !== connection.key) {
        continue;
      }

      clearTimeout(pending.timeout);
      this.pendingLocalActions.delete(pending.requestId);
      pending.reject(error);
    }
  }

  private closeConnection(connection: BridgeConnection, code: number, reason: string): void {
    this.unregister(connection, new BridgeConnectionClosedError(reason));

    if (connection.socket.readyState === webSocketOpenState) {
      connection.socket.close(code, reason);
    }
  }

  private send(connection: BridgeConnection, message: unknown): void {
    if (connection.socket.readyState !== webSocketOpenState) {
      throw new BridgeConnectionClosedError("Bridge connection is not open.");
    }

    connection.socket.send(JSON.stringify(bridgeServerMessageSchema.parse(message)));
  }

  private snapshot(connection: BridgeConnection): BridgeConnectionSnapshot {
    const busyRun = [...this.pendingRuns.values()].find((run) => run.connectionKey === connection.key);
    const busyAction = [...this.pendingLocalActions.values()].find((action) => action.connectionKey === connection.key);

    return {
      roomId: connection.roomId,
      agent: connection.agent,
      connectedAt: connection.connectedAt.toISOString(),
      lastHeartbeatAt: connection.lastHeartbeatAt.toISOString(),
      busyTaskId: busyRun?.taskId ?? busyAction?.artifactId ?? null
    };
  }
}

export class BridgeUnavailableError extends Error {}
export class BridgeTaskFailedError extends Error {}
export class BridgeTaskTimeoutError extends Error {}
export class BridgeTaskCanceledError extends Error {}
export class BridgeConnectionClosedError extends Error {}

function connectionKey(roomId: string, agentId: string): string {
  return `${roomId}:${agentId}`;
}

function taskKey(roomId: string, taskId: string): string {
  return `${roomId}:${taskId}`;
}
