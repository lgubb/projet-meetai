import type { FastifyInstance } from "fastify";
import { parseJeanIntent } from "@jean/jean-core";
import type { ArtifactType, RealtimeRoomEvent } from "@jean/shared";

import { runJeanTask, type JeanTaskRunnerOptions } from "./jean-task-runner.js";
import { createAgentSpeechEvent, createTaskWithArtifact } from "./room-task-service.js";

type RoomRecord = {
  id: string;
  organizationId: string;
};

type JeanAgentRecord = {
  id: string;
  organizationId: string;
  name: string;
};

export async function handleJeanTranscriptFinalEvent(
  server: FastifyInstance,
  room: RoomRecord,
  event: Extract<RealtimeRoomEvent, { type: "transcript.final" }>,
  options: JeanTaskRunnerOptions = {}
): Promise<void> {
  const intent = parseJeanIntent(event.text);

  if (!intent.shouldAct || !intent.title || !intent.artifactType || !intent.responseText) {
    return;
  }

  const jean = await ensureJeanAgent(server, room.organizationId);
  const bundle = await createTaskWithArtifact(server, {
    roomId: room.id,
    createdByAgentId: jean.id,
    assignedAgentId: jean.id,
    title: intent.title,
    description: intent.description,
    artifact: {
      title: intent.title,
      type: intent.artifactType,
      content: createDefaultArtifactContent(intent.artifactType, intent.title, intent.description)
    }
  });

  for (const createdEvent of bundle.events) {
    server.roomEvents.publish(createdEvent);
  }

  server.roomEvents.publish(
    await createAgentSpeechEvent(server, {
      roomId: room.id,
      taskId: bundle.task.id,
      agentId: jean.id,
      text: intent.responseText
    })
  );

  await runJeanTask(
    server,
    {
      intent,
      task: bundle.task,
      artifact: bundle.artifact,
      agent: jean
    },
    options
  );
}

async function ensureJeanAgent(server: FastifyInstance, organizationId: string): Promise<JeanAgentRecord> {
  const existingAgent = await server.db.agent.findFirst({
    where: {
      organizationId,
      name: "Jean",
      provider: "NATIVE"
    }
  });

  if (existingAgent) {
    return existingAgent;
  }

  return server.db.agent.create({
    data: {
      organizationId,
      name: "Jean",
      provider: "NATIVE",
      capabilities: ["ORCHESTRATION", "TASK_PLANNING", "ARTIFACT_GENERATION"]
    }
  });
}

function createDefaultArtifactContent(
  artifactType: ArtifactType,
  title: string,
  description: string | null
): Record<string, unknown> {
  return {
    title,
    type: artifactType,
    text: description ? `Initial artifact for: ${description}` : `Initial artifact for ${title}`
  };
}
