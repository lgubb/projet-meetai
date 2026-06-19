import type { FastifyInstance } from "fastify";
import type { AgentIntent, AgentTaskType } from "@jean/jean-core";
import type { AgentCapability, AgentProvider, BridgeTaskType, RealtimeArtifact, RealtimeTask } from "@jean/shared";

import { createE2BConnector } from "./e2b-connector.js";
import { createPerplexityConnector } from "./perplexity-connector.js";
import { createRemoteMcpConnector } from "./remote-mcp-connector.js";
import { createV0Connector } from "./v0-connector.js";
import { BridgeConnectionClosedError, BridgeTaskCanceledError } from "./local-agent-bridge.js";
import { appendTaskLog, patchArtifact, updateArtifactPreviewUrl, updateTaskStatus } from "./room-task-service.js";

type JeanAgentRecord = {
  id: string;
};

export type AgentTaskInput = {
  intent: AgentIntent;
  task: RealtimeTask;
  artifact: RealtimeArtifact;
  agent: JeanAgentRecord;
};

export type AgentTaskStep =
  | {
      type: "log";
      message: string;
    }
  | {
      type: "artifact.patch";
      patch: Record<string, unknown>;
    }
  | {
      type: "artifact.preview_url";
      previewUrl: string;
    };

export interface AgentConnector {
  id: string;
  canHandle(input: AgentTaskInput): boolean;
  run(input: AgentTaskInput): AsyncIterable<AgentTaskStep>;
}

const localMockConnector: AgentConnector = {
  id: "local-mock",
  canHandle() {
    return true;
  },
  async *run(input) {
    yield {
      type: "log",
      message: "Préparation du contexte de la tâche."
    };
    yield {
      type: "log",
      message: buildGenerationLog(input.intent.taskType)
    };
    yield {
      type: "artifact.patch",
      patch: buildArtifactPatch(input)
    };
    yield {
      type: "log",
      message: "Finalisation de l'artifact."
    };
  }
};

export type JeanTaskRunnerOptions = {
  connectors?: AgentConnector[];
};

export async function runJeanTask(
  server: FastifyInstance,
  input: AgentTaskInput,
  options: JeanTaskRunnerOptions = {}
): Promise<void> {
  try {
    const running = await updateTaskStatus(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      status: "RUNNING"
    });

    if (running) {
      server.roomEvents.publish(running.event);
    }

    const connector = getConnectors(server, options).find((candidate) => candidate.canHandle(input));

    if (!connector) {
      throw new Error("No Jean connector can handle this task.");
    }

    await runConnector(server, input, connector);

    const completed = await updateTaskStatus(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      status: "COMPLETED"
    });

    if (completed) {
      server.roomEvents.publish(completed.event);
    }
  } catch (error) {
    const wasCanceled = error instanceof BridgeTaskCanceledError;
    const wasBridgeDisconnected = error instanceof BridgeConnectionClosedError;
    const message = error instanceof Error ? error.message : "Jean task runner failed.";
    const log = await appendTaskLog(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      message: formatRunnerErrorLog(message, {
        wasBridgeDisconnected,
        wasCanceled
      })
    });

    if (log) {
      server.roomEvents.publish(log.event);
    }

    const failed = await updateTaskStatus(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      status: wasCanceled ? "CANCELED" : "FAILED"
    });

    if (failed) {
      server.roomEvents.publish(failed.event);
    }
  }
}

function getConnectors(server: FastifyInstance, options: JeanTaskRunnerOptions): AgentConnector[] {
  if (options.connectors) {
    return [...options.connectors, localMockConnector];
  }

  const bridgeConnector = createLocalBridgeConnector(server);
  const remoteMcpConnector = createRemoteMcpConnector();
  const v0Connector = createV0Connector();
  const e2bConnector = createE2BConnector();
  const perplexityConnector = createPerplexityConnector();
  const connectors = [
    bridgeConnector,
    remoteMcpConnector,
    v0Connector,
    e2bConnector,
    perplexityConnector,
    localMockConnector
  ].filter(isPresent);

  return connectors;
}

async function runConnector(server: FastifyInstance, input: AgentTaskInput, connector: AgentConnector): Promise<void> {
  try {
    await publishConnectorSteps(server, input, connector);
  } catch (error) {
    if (connector.id === localMockConnector.id || connector.id === "local-bridge") {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Connector failed.";
    const fallbackLog = await appendTaskLog(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      message: `${formatConnectorName(connector.id)} indisponible, fallback local: ${message}`
    });

    if (fallbackLog) {
      server.roomEvents.publish(fallbackLog.event);
    }

    await publishConnectorSteps(server, input, localMockConnector);
  }
}

function createLocalBridgeConnector(server: FastifyInstance): AgentConnector {
  return {
    id: "local-bridge",
    canHandle(input) {
      const taskType = toBridgeTaskType(input.intent.taskType);
      const requiredCapability = requiredCapabilityForTaskType(taskType);
      const provider = requiredCapability ? selectBridgeProvider(server, input, taskType, requiredCapability) : null;

      if (!requiredCapability || (taskType !== "code" && taskType !== "prototype")) {
        return false;
      }

      return provider !== null;
    },
    async *run(input) {
      const taskType = toBridgeTaskType(input.intent.taskType);
      const requiredCapability = requiredCapabilityForTaskType(taskType);
      const providerPreferences = bridgeProviderPreferencesForTaskType(taskType);
      const preferredProvider = requiredCapability ? selectBridgeProvider(server, input, taskType, requiredCapability) : null;

      if (!requiredCapability || !preferredProvider) {
        throw new Error("Local bridge cannot resolve a required task capability.");
      }

      yield {
        type: "log",
        message: `Delegated to ${formatAgentProviderName(preferredProvider)} via jean-bridge.`
      };

      const result = await server.localAgentBridge.dispatchTask({
        roomId: input.task.roomId,
        taskId: input.task.id,
        artifactId: input.artifact.id,
        title: input.task.title,
        description: input.task.description,
        taskType,
        artifactType: input.artifact.type,
        objective: input.intent.description ?? input.intent.commandText ?? input.task.title,
        mcpHttpUrl: buildRoomMcpUrl(input.task.roomId),
        requiredCapability,
        allowedProviders: providerPreferences,
        preferredProvider,
        timeoutMs: readBridgeTaskTimeoutMs(),
        onAccepted: () => {
          void publishBridgeAcceptedLog(server, input, preferredProvider).catch((error) => {
            server.log.warn(error, "Failed to persist bridge accepted log.");
          });
        }
      });

      yield {
        type: "log",
        message: result.summary ?? `Agent local ${result.agent.name} a terminé la tâche.`
      };
    }
  };
}

async function publishConnectorSteps(
  server: FastifyInstance,
  input: AgentTaskInput,
  connector: AgentConnector
): Promise<void> {
  for await (const step of connector.run(input)) {
    if (step.type === "log") {
      const log = await appendTaskLog(server, {
        roomId: input.task.roomId,
        taskId: input.task.id,
        message: step.message
      });

      if (log) {
        server.roomEvents.publish(log.event);
      }
    }

    if (step.type === "artifact.patch") {
      const patch = await patchArtifact(server, {
        roomId: input.artifact.roomId,
        artifactId: input.artifact.id,
        patch: step.patch
      });

      if (patch) {
        server.roomEvents.publish(patch.event);
      }
    }

    if (step.type === "artifact.preview_url") {
      const preview = await updateArtifactPreviewUrl(server, {
        roomId: input.artifact.roomId,
        artifactId: input.artifact.id,
        previewUrl: step.previewUrl
      });

      if (preview) {
        server.roomEvents.publish(preview.event);
      }
    }
  }
}

async function publishBridgeAcceptedLog(server: FastifyInstance, input: AgentTaskInput, provider: AgentProvider): Promise<void> {
  const log = await appendTaskLog(server, {
    roomId: input.task.roomId,
    taskId: input.task.id,
    message: `${formatAgentProviderName(provider)} claimed the task.`
  });

  if (log) {
    server.roomEvents.publish(log.event);
  }
}

function selectBridgeProvider(
  server: FastifyInstance,
  input: AgentTaskInput,
  taskType: BridgeTaskType,
  requiredCapability: AgentCapability
): AgentProvider | null {
  for (const provider of bridgeProviderPreferencesForTaskType(taskType)) {
    if (
      server.localAgentBridge.hasAvailableAgent({
        roomId: input.task.roomId,
        requiredCapability,
        allowedProviders: [provider],
        preferredProvider: provider
      })
    ) {
      return provider;
    }
  }

  return null;
}

function bridgeProviderPreferencesForTaskType(taskType: BridgeTaskType): AgentProvider[] {
  if (taskType === "prototype") {
    return ["LOVABLE", "V0", "CODEX", "CLAUDE_CODE", "MCP", "CUSTOM"];
  }

  if (taskType === "code") {
    return ["CODEX", "CLAUDE_CODE", "V0", "LOVABLE", "MCP", "CUSTOM"];
  }

  return [];
}

function formatRunnerErrorLog(
  message: string,
  flags: {
    wasBridgeDisconnected: boolean;
    wasCanceled: boolean;
  }
): string {
  if (flags.wasCanceled) {
    return `Tâche annulée: ${message}`;
  }

  if (flags.wasBridgeDisconnected) {
    return `bridge_disconnected: ${message}`;
  }

  return `Erreur Jean: ${message}`;
}

function buildGenerationLog(taskType: AgentTaskType | null): string {
  if (taskType === "research") {
    return "Génération d'une synthèse de recherche locale.";
  }

  if (taskType === "code") {
    return "Génération d'un brouillon de code local.";
  }

  if (taskType === "prototype") {
    return "Génération d'une preview locale.";
  }

  return "Génération d'un artifact local.";
}

function buildArtifactPatch(input: AgentTaskInput): Record<string, unknown> {
  if (input.intent.taskType === "research") {
    return buildResearchPatch(input);
  }

  if (input.intent.taskType === "code") {
    return buildCodePatch(input);
  }

  if (input.intent.taskType === "prototype") {
    return buildPrototypePatch(input);
  }

  if (input.intent.taskType === "doc") {
    return buildDocumentPatch(input);
  }

  return buildFallbackPatch(input);
}

function buildDocumentPatch(input: AgentTaskInput): Record<string, unknown> {
  const objective = input.intent.description ?? input.task.title;

  return {
    text: `Jean a préparé un document de travail pour: ${objective}.`,
    sections: [
      {
        title: "Objectif",
        text: objective
      },
      {
        title: "Prochaine étape",
        text: "Remplacer ce brouillon local par un connecteur spécialisé quand il sera disponible."
      }
    ]
  };
}

function buildResearchPatch(input: AgentTaskInput): Record<string, unknown> {
  const topic = extractResearchTopic(input.intent.commandText ?? input.intent.description ?? input.task.title);

  return {
    summary: `Synthèse locale provisoire sur ${topic}.`,
    text: `Jean a créé une recherche mock pour ${topic}. Le prochain jalon branchera Perplexity pour produire une vraie synthèse sourcée.`,
    sources: [
      {
        title: `${topic} - documentation officielle`,
        url: "https://example.com/source-officielle"
      },
      {
        title: `${topic} - notes de benchmark`,
        url: "https://example.com/benchmark"
      }
    ]
  };
}

function buildCodePatch(input: AgentTaskInput): Record<string, unknown> {
  const objective = input.intent.description ?? input.task.title;

  return {
    text: `Jean a préparé un brouillon de code local pour: ${objective}.`,
    files: [
      {
        path: "README.md",
        content: `# ${input.task.title}\n\nObjectif: ${objective}\n\nCe contenu est généré par le mock local Jean.`
      }
    ]
  };
}

function buildPrototypePatch(input: AgentTaskInput): Record<string, unknown> {
  const objective = input.intent.description ?? input.task.title;

  return {
    text: `Jean a préparé une preview locale provisoire pour: ${objective}.`
  };
}

function buildFallbackPatch(input: AgentTaskInput): Record<string, unknown> {
  const objective = input.intent.description ?? input.task.title;

  return {
    text: `Jean a préparé un artifact local pour: ${objective}.`
  };
}

function extractResearchTopic(value: string): string {
  const match = value.match(/\b(?:sur|about|on)\s+(.+)$/i);
  const topic = match?.[1]?.trim().replace(/[.!?]$/, "");

  return topic || value;
}

function formatConnectorName(connectorId: string): string {
  const labels: Record<string, string> = {
    e2b: "E2B",
    "local-bridge": "jean-bridge",
    perplexity: "Perplexity",
    "remote-mcp": "Remote MCP",
    v0: "v0"
  };

  return labels[connectorId] ?? connectorId;
}

function formatAgentProviderName(provider: AgentProvider): string {
  const labels: Record<AgentProvider, string> = {
    CLAUDE_CODE: "Claude Code",
    CODEX: "Codex Local",
    CUSTOM: "Custom Agent",
    E2B: "E2B",
    LOVABLE: "Lovable",
    MCP: "MCP Agent",
    NATIVE: "Jean",
    PERPLEXITY: "Perplexity",
    V0: "v0"
  };

  return labels[provider];
}

function toBridgeTaskType(taskType: AgentTaskType | null): BridgeTaskType {
  if (taskType === "research" || taskType === "code" || taskType === "prototype" || taskType === "doc") {
    return taskType;
  }

  return "unknown";
}

function requiredCapabilityForTaskType(taskType: BridgeTaskType): AgentCapability | null {
  if (taskType === "code") {
    return "CODE_GENERATION";
  }

  if (taskType === "prototype") {
    return "PROTOTYPING";
  }

  if (taskType === "doc") {
    return "ARTIFACT_GENERATION";
  }

  if (taskType === "research") {
    return "RESEARCH";
  }

  return null;
}

function buildRoomMcpUrl(roomId: string): string {
  const apiUrl = process.env.WORKROOM_API_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3001"}`;

  return new URL(`/rooms/${roomId}/mcp`, apiUrl).toString();
}

function readBridgeTaskTimeoutMs(): number | undefined {
  const rawValue = process.env.WORKROOM_BRIDGE_TASK_TIMEOUT_MS;

  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number(rawValue);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
