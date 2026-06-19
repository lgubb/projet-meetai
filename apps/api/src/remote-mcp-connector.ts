import { z } from "zod";

import type { AgentConnector, AgentTaskInput } from "./jean-task-runner.js";

type RemoteMcpConnectorOptions = {
  fetchFn?: typeof fetch;
  taskTypes?: string[];
  timeoutMs?: number;
  token?: string;
  toolName?: string;
  url?: string;
};

type RemoteMcpToolInput = {
  fetchFn: typeof fetch;
  input: AgentTaskInput;
  timeoutMs: number;
  token: string | null;
  toolName: string;
  url: string;
};

const defaultToolName = "workroom.run_task";
const defaultTimeoutMs = 60_000;
const supportedTaskTypes = new Set(["research", "code", "prototype", "doc"]);

const jsonRpcResponseSchema = z
  .object({
    error: z
      .object({
        code: z.number(),
        message: z.string().min(1)
      })
      .passthrough()
      .optional(),
    result: z
      .object({
        content: z.unknown().optional(),
        structuredContent: z.record(z.string(), z.unknown()).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export function createRemoteMcpConnector(options: RemoteMcpConnectorOptions = {}): AgentConnector | null {
  const url = options.url ?? process.env.WORKROOM_REMOTE_MCP_URL;

  if (!url) {
    return null;
  }

  const fetchFn = options.fetchFn ?? fetch;
  const taskTypes = new Set(options.taskTypes ?? readTaskTypes(process.env.WORKROOM_REMOTE_MCP_TASK_TYPES));
  const timeoutMs = options.timeoutMs ?? readPositiveInteger(process.env.WORKROOM_REMOTE_MCP_TIMEOUT_MS) ?? defaultTimeoutMs;
  const token = options.token ?? process.env.WORKROOM_REMOTE_MCP_TOKEN ?? null;
  const toolName = options.toolName ?? process.env.WORKROOM_REMOTE_MCP_TOOL_NAME ?? defaultToolName;

  return {
    id: "remote-mcp",
    canHandle(input) {
      return Boolean(input.intent.taskType && taskTypes.has(input.intent.taskType));
    },
    async *run(input) {
      yield {
        type: "log",
        message: "Remote MCP connector is running."
      };

      const result = await callRemoteMcpTool({
        fetchFn,
        input,
        timeoutMs,
        token,
        toolName,
        url
      });

      if (result.summary) {
        yield {
          type: "log",
          message: result.summary
        };
      }

      yield {
        type: "artifact.patch",
        patch: result.patch
      };

      if (result.previewUrl) {
        yield {
          type: "artifact.preview_url",
          previewUrl: result.previewUrl
        };
      }
    }
  };
}

async function callRemoteMcpTool(input: RemoteMcpToolInput): Promise<{
  patch: Record<string, unknown>;
  previewUrl: string | null;
  summary: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs);

  try {
    const response = await input.fetchFn(input.url, {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `remote-mcp-${Date.now()}`,
        method: "tools/call",
        params: {
          name: input.toolName,
          arguments: buildRemoteMcpArguments(input.input)
        }
      }),
      headers: buildHeaders(input.token),
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Remote MCP request failed with ${response.status}.`);
    }

    const payload = jsonRpcResponseSchema.parse(await response.json());

    if (payload.error) {
      throw new Error(`Remote MCP tool failed: ${payload.error.message}`);
    }

    const structuredContent = payload.result?.structuredContent ?? {};
    const patch = normalizePatch(structuredContent, payload.result?.content);
    const previewUrl = readString(structuredContent, "previewUrl") ?? readString(structuredContent, "preview_url") ?? null;
    const summary = readString(structuredContent, "summary") ?? readString(structuredContent, "text");

    return {
      patch,
      previewUrl,
      summary
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildRemoteMcpArguments(input: AgentTaskInput): Record<string, unknown> {
  return {
    artifactId: input.artifact.id,
    artifactType: input.artifact.type,
    commandText: input.intent.commandText,
    description: input.task.description,
    objective: input.intent.description ?? input.intent.commandText ?? input.task.title,
    roomId: input.task.roomId,
    taskId: input.task.id,
    taskTitle: input.task.title,
    taskType: input.intent.taskType
  };
}

function buildHeaders(token: string | null): Record<string, string> {
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    accept: "application/json",
    "content-type": "application/json"
  };
}

function normalizePatch(structuredContent: Record<string, unknown>, content: unknown): Record<string, unknown> {
  const patch = readRecord(structuredContent, "patch");

  if (patch) {
    return patch;
  }

  const artifact = readRecord(structuredContent, "artifact");

  if (artifact) {
    return artifact;
  }

  if (Object.keys(structuredContent).length > 0) {
    return structuredContent;
  }

  const text = readMcpTextContent(content);

  if (text) {
    return {
      text
    };
  }

  throw new Error("Remote MCP tool returned no artifact patch.");
}

function readTaskTypes(value: string | undefined): string[] {
  if (!value) {
    return [...supportedTaskTypes];
  }

  const taskTypes = value
    .split(",")
    .map((taskType) => taskType.trim())
    .filter(Boolean);

  if (taskTypes.length === 0) {
    return [...supportedTaskTypes];
  }

  return taskTypes.filter((taskType) => supportedTaskTypes.has(taskType));
}

function readPositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readMcpTextContent(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .map((entry) => (isRecord(entry) && entry.type === "text" && typeof entry.text === "string" ? entry.text : null))
    .filter((entry): entry is string => Boolean(entry))
    .join("\n")
    .trim();

  return text || null;
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];

  return isRecord(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
