import assert from "node:assert/strict";
import test from "node:test";

import type { AgentTaskInput, AgentTaskStep } from "./jean-task-runner.js";
import { createRemoteMcpConnector } from "./remote-mcp-connector.js";

test("remote MCP connector is disabled without a URL", () => {
  assert.equal(createRemoteMcpConnector(), null);
});

test("remote MCP connector filters configured task types", () => {
  const connector = createRemoteMcpConnector({
    taskTypes: ["prototype"],
    url: "https://mcp.example/rpc"
  });

  assert.ok(connector);
  assert.equal(connector.canHandle(buildTaskInput({ taskType: "prototype" })), true);
  assert.equal(connector.canHandle(buildTaskInput({ taskType: "research" })), false);
});

test("remote MCP connector calls a configured MCP tool and yields artifact updates", async () => {
  const requests: Array<{ body: Record<string, unknown>; headers: Headers; url: string }> = [];
  const fetchFn: typeof fetch = async (url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
      url: String(url)
    });

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "remote-mcp-test",
        result: {
          structuredContent: {
            patch: {
              provider: "remote-mcp",
              text: "Remote MCP generated artifact.",
              files: [
                {
                  path: "README.md",
                  content: "# Remote MCP"
                }
              ]
            },
            previewUrl: "https://preview.example/remote-mcp",
            summary: "Remote MCP completed."
          }
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
  const connector = createRemoteMcpConnector({
    fetchFn,
    taskTypes: ["prototype"],
    token: "remote-token",
    toolName: "lovable.run",
    url: "https://mcp.example/rpc"
  });

  assert.ok(connector);

  const steps = await collectSteps(connector.run(buildTaskInput({ taskType: "prototype" })));

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://mcp.example/rpc");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer remote-token");
  assert.deepEqual(readRpcParams(requests[0]?.body), {
    name: "lovable.run",
    arguments: {
      artifactId: "artifact-1",
      artifactType: "PREVIEW",
      commandText: "Jean, prototype remote MCP.",
      description: "Build a remote prototype.",
      objective: "Build a remote prototype.",
      roomId: "room-1",
      taskId: "task-1",
      taskTitle: "Remote MCP task",
      taskType: "prototype"
    }
  });
  assert.deepEqual(steps, [
    {
      type: "log",
      message: "Remote MCP connector is running."
    },
    {
      type: "log",
      message: "Remote MCP completed."
    },
    {
      type: "artifact.patch",
      patch: {
        provider: "remote-mcp",
        text: "Remote MCP generated artifact.",
        files: [
          {
            path: "README.md",
            content: "# Remote MCP"
          }
        ]
      }
    },
    {
      type: "artifact.preview_url",
      previewUrl: "https://preview.example/remote-mcp"
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

function readRpcParams(body: Record<string, unknown>): Record<string, unknown> {
  assert.equal(body.method, "tools/call");
  assert.ok(body.params && typeof body.params === "object" && !Array.isArray(body.params));

  return body.params as Record<string, unknown>;
}

function buildTaskInput(input: { taskType: AgentTaskInput["intent"]["taskType"] }): AgentTaskInput {
  const now = "2026-06-19T12:00:00.000Z";

  return {
    agent: {
      id: "jean-agent"
    },
    artifact: {
      id: "artifact-1",
      createdAt: now,
      createdByAgentId: null,
      createdByUserId: "user-1",
      latestVersion: {
        id: "artifact-version-1",
        version: 1,
        content: {},
        createdAt: now
      },
      roomId: "room-1",
      status: "DRAFT",
      taskId: "task-1",
      title: "Remote MCP artifact",
      type: "PREVIEW",
      updatedAt: now
    },
    intent: {
      commandText: "Jean, prototype remote MCP.",
      confidence: 0.9,
      description: "Build a remote prototype.",
      artifactType: "PREVIEW",
      language: "en",
      responseText: "Yes, I will create prototype.",
      shouldAct: true,
      taskType: input.taskType,
      title: "Remote MCP task"
    },
    task: {
      id: "task-1",
      assignedAgentId: null,
      completedAt: null,
      createdAt: now,
      createdByAgentId: null,
      createdByUserId: "user-1",
      description: "Build a remote prototype.",
      riskLevel: "LOW",
      roomId: "room-1",
      status: "PENDING",
      title: "Remote MCP task",
      updatedAt: now
    }
  };
}
