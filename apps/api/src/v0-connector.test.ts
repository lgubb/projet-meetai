import assert from "node:assert/strict";
import test from "node:test";

import type { AgentTaskInput, AgentTaskStep } from "./jean-task-runner.js";
import { createV0Connector } from "./v0-connector.js";

test("v0 connector is disabled without an API key", () => {
  assert.equal(createV0Connector(), null);
});

test("v0 connector filters configured task types", () => {
  const connector = createV0Connector({
    apiKey: "v0-key",
    taskTypes: ["prototype"]
  });

  assert.ok(connector);
  assert.equal(connector.canHandle(buildTaskInput({ taskType: "prototype" })), true);
  assert.equal(connector.canHandle(buildTaskInput({ taskType: "code" })), false);
});

test("v0 connector creates a chat and yields artifact updates", async () => {
  const requests: Array<{ body: Record<string, unknown>; headers: Headers; url: string }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
      url: String(url)
    });

    return new Response(
      JSON.stringify({
        id: "chat-v0-1",
        webUrl: "https://v0.dev/chat/chat-v0-1",
        latestVersion: {
          id: "version-v0-1",
          files: [
            {
              path: "app/page.tsx",
              content: "export default function Page() { return <main>v0</main>; }"
            }
          ],
          previewUrl: "https://preview.v0.dev/chat-v0-1"
        }
      }),
      {
        headers: {
          "content-type": "application/json"
        },
        status: 200
      }
    );
  };
  const connector = createV0Connector({
    apiKey: "v0-key",
    baseUrl: "https://api.v0.example/v1",
    fetchFn,
    model: "v0-1.5-lg",
    taskTypes: ["prototype"]
  });

  assert.ok(connector);

  const steps = await collectSteps(connector.run(buildTaskInput({ taskType: "prototype" })));

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://api.v0.example/v1/chats");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer v0-key");
  assert.equal(requests[0]?.body.model, "v0-1.5-lg");
  assert.equal(typeof requests[0]?.body.system, "string");
  assert.match(String(requests[0]?.body.message), /Build a v0 prototype/);
  assert.match(String(requests[0]?.body.message), /Task type: prototype/);
  assert.deepEqual(steps, [
    {
      type: "log",
      message: "v0 generation is running."
    },
    {
      type: "log",
      message: "v0 generation completed."
    },
    {
      type: "artifact.patch",
      patch: {
        provider: "v0",
        model: "v0-1.5-lg",
        text:
          "v0 generated a Workroom artifact. 1 file returned. Preview: https://preview.v0.dev/chat-v0-1 v0 chat: https://v0.dev/chat/chat-v0-1",
        chatId: "chat-v0-1",
        versionId: "version-v0-1",
        webUrl: "https://v0.dev/chat/chat-v0-1",
        previewUrl: "https://preview.v0.dev/chat-v0-1",
        files: [
          {
            path: "app/page.tsx",
            content: "export default function Page() { return <main>v0</main>; }"
          }
        ]
      }
    },
    {
      type: "artifact.preview_url",
      previewUrl: "https://preview.v0.dev/chat-v0-1"
    }
  ]);
});

async function collectSteps(input: AsyncIterable<AgentTaskStep>): Promise<AgentTaskStep[]> {
  const steps: AgentTaskStep[] = [];

  for await (const step of input) {
    steps.push(step);
  }

  return steps;
}

function buildTaskInput(input: { taskType: AgentTaskInput["intent"]["taskType"] }): AgentTaskInput {
  const now = "2026-06-19T12:00:00.000Z";

  return {
    agent: {
      id: "jean-agent"
    },
    artifact: {
      id: "artifact-v0-1",
      createdAt: now,
      createdByAgentId: null,
      createdByUserId: "user-1",
      latestVersion: {
        id: "artifact-version-v0-1",
        version: 1,
        content: {},
        createdAt: now
      },
      roomId: "room-1",
      status: "DRAFT",
      taskId: "task-v0-1",
      title: "v0 artifact",
      type: "PREVIEW",
      updatedAt: now
    },
    intent: {
      artifactType: "PREVIEW",
      commandText: "Jean, build a v0 prototype.",
      confidence: 0.9,
      description: "Build a v0 prototype.",
      language: "en",
      responseText: "Yes, I will create prototype.",
      shouldAct: true,
      taskType: input.taskType,
      title: "v0 task"
    },
    task: {
      id: "task-v0-1",
      assignedAgentId: null,
      completedAt: null,
      createdAt: now,
      createdByAgentId: null,
      createdByUserId: "user-1",
      description: "Build a v0 prototype.",
      riskLevel: "LOW",
      roomId: "room-1",
      status: "PENDING",
      title: "v0 task",
      updatedAt: now
    }
  };
}
