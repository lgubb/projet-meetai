import type { FastifyInstance } from "fastify";
import type { AgentIntent, AgentTaskType } from "@jean/jean-core";
import type { RealtimeArtifact, RealtimeTask } from "@jean/shared";

import { createE2BConnector } from "./e2b-connector.js";
import { createPerplexityConnector } from "./perplexity-connector.js";
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

    const connector = getConnectors(options).find((candidate) => candidate.canHandle(input));

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
    const message = error instanceof Error ? error.message : "Jean task runner failed.";
    const log = await appendTaskLog(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      message: `Erreur Jean: ${message}`
    });

    if (log) {
      server.roomEvents.publish(log.event);
    }

    const failed = await updateTaskStatus(server, {
      roomId: input.task.roomId,
      taskId: input.task.id,
      status: "FAILED"
    });

    if (failed) {
      server.roomEvents.publish(failed.event);
    }
  }
}

function getConnectors(options: JeanTaskRunnerOptions): AgentConnector[] {
  if (options.connectors) {
    return [...options.connectors, localMockConnector];
  }

  const e2bConnector = createE2BConnector();
  const perplexityConnector = createPerplexityConnector();
  const connectors = [e2bConnector, perplexityConnector, localMockConnector].filter(isPresent);

  return connectors;
}

async function runConnector(server: FastifyInstance, input: AgentTaskInput, connector: AgentConnector): Promise<void> {
  try {
    await publishConnectorSteps(server, input, connector);
  } catch (error) {
    if (connector.id === localMockConnector.id) {
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
    perplexity: "Perplexity"
  };

  return labels[connectorId] ?? connectorId;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
