import { z } from "zod";

import type { AgentConnector, AgentTaskInput } from "./jean-task-runner.js";

type V0ConnectorOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  model?: string;
  systemPrompt?: string;
  taskTypes?: string[];
  timeoutMs?: number;
};

type V0RequestInput = {
  apiKey: string;
  baseUrl: string;
  fetchFn: typeof fetch;
  input: AgentTaskInput;
  model: string;
  systemPrompt: string;
  timeoutMs: number;
};

const defaultBaseUrl = "https://api.v0.dev/v1";
const defaultModel = "v0-1.5-md";
const defaultTimeoutMs = 120_000;
const supportedTaskTypes = new Set(["prototype", "code"]);
const v0ChatResponseSchema = z
  .object({
    id: z.string().min(1).optional(),
    latestVersion: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();

export function createV0Connector(options: V0ConnectorOptions = {}): AgentConnector | null {
  const apiKey = options.apiKey ?? process.env.V0_API_KEY;

  if (!apiKey) {
    return null;
  }

  const baseUrl = options.baseUrl ?? process.env.V0_API_BASE_URL ?? defaultBaseUrl;
  const fetchFn = options.fetchFn ?? fetch;
  const model = options.model ?? process.env.V0_MODEL ?? defaultModel;
  const systemPrompt = options.systemPrompt ?? process.env.V0_SYSTEM_PROMPT ?? defaultSystemPrompt;
  const taskTypes = new Set(options.taskTypes ?? readTaskTypes(process.env.V0_TASK_TYPES));
  const timeoutMs = options.timeoutMs ?? readPositiveInteger(process.env.V0_TIMEOUT_MS) ?? defaultTimeoutMs;

  return {
    id: "v0",
    canHandle(input) {
      return Boolean(input.intent.taskType && taskTypes.has(input.intent.taskType));
    },
    async *run(input) {
      yield {
        type: "log",
        message: "v0 generation is running."
      };

      const result = await createV0Chat({
        apiKey,
        baseUrl,
        fetchFn,
        input,
        model,
        systemPrompt,
        timeoutMs
      });

      yield {
        type: "log",
        message: "v0 generation completed."
      };
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

async function createV0Chat(input: V0RequestInput): Promise<{
  patch: Record<string, unknown>;
  previewUrl: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs);

  try {
    const response = await input.fetchFn(`${input.baseUrl.replace(/\/$/, "")}/chats`, {
      body: JSON.stringify({
        message: buildV0Message(input.input),
        model: input.model,
        system: input.systemPrompt
      }),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json"
      },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`v0 API rejected generation request with ${response.status}.`);
    }

    return normalizeV0Response(v0ChatResponseSchema.parse(await response.json()), input.model);
  } finally {
    clearTimeout(timeout);
  }
}

function buildV0Message(input: AgentTaskInput): string {
  const objective = input.intent.description ?? input.intent.commandText ?? input.task.description ?? input.task.title;

  return [
    `Task: ${input.task.title}`,
    `Task type: ${input.intent.taskType ?? "unknown"}`,
    `Artifact type: ${input.artifact.type}`,
    "",
    objective,
    "",
    "Return production-ready files when possible. Keep external side effects out of the generated result."
  ].join("\n");
}

function normalizeV0Response(payload: z.infer<typeof v0ChatResponseSchema>, model: string): {
  patch: Record<string, unknown>;
  previewUrl: string | null;
} {
  const latestVersion = readRecord(payload, "latestVersion");
  const deployment = readRecord(payload, "deployment") ?? readRecord(latestVersion, "deployment");
  const previewUrl =
    readUrl(payload, "previewUrl") ??
    readUrl(payload, "preview_url") ??
    readUrl(payload, "demoUrl") ??
    readUrl(latestVersion, "previewUrl") ??
    readUrl(latestVersion, "demoUrl") ??
    readUrl(deployment, "url") ??
    null;
  const webUrl = readUrl(payload, "webUrl") ?? readUrl(payload, "web_url") ?? readUrl(payload, "url") ?? null;
  const files = normalizeFiles(readArray(payload, "files") ?? readArray(latestVersion, "files"));
  const versionId = readString(latestVersion, "id");

  if (!payload.id && !webUrl && !previewUrl && files.length === 0) {
    throw new Error("v0 API returned no usable chat, preview, or files.");
  }

  return {
    patch: {
      provider: "v0",
      model,
      text: buildPatchText(webUrl, previewUrl, files.length),
      ...(payload.id ? { chatId: payload.id } : {}),
      ...(versionId ? { versionId } : {}),
      ...(webUrl ? { webUrl } : {}),
      ...(previewUrl ? { previewUrl } : {}),
      ...(files.length > 0 ? { files } : {})
    },
    previewUrl
  };
}

function buildPatchText(webUrl: string | null, previewUrl: string | null, fileCount: number): string {
  const parts = ["v0 generated a Workroom artifact."];

  if (fileCount > 0) {
    parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"} returned.`);
  }

  if (previewUrl) {
    parts.push(`Preview: ${previewUrl}`);
  }

  if (webUrl) {
    parts.push(`v0 chat: ${webUrl}`);
  }

  return parts.join(" ");
}

function normalizeFiles(files: unknown[] | null): Array<{ path: string; content: string }> {
  if (!files) {
    return [];
  }

  return files
    .map((file) => {
      if (!isRecord(file)) {
        return null;
      }

      const path = readString(file, "path") ?? readString(file, "name");
      const content = readString(file, "content") ?? readString(file, "source");

      return path && content ? { path, content } : null;
    })
    .filter((file): file is { path: string; content: string } => Boolean(file));
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

function readArray(record: Record<string, unknown> | null, key: string): unknown[] | null {
  const value = record?.[key];

  return Array.isArray(value) ? value : null;
}

function readRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];

  return isRecord(value) ? value : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function readUrl(record: Record<string, unknown> | null, key: string): string | null {
  const value = readString(record, key);

  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const defaultSystemPrompt =
  "You are v0 generating code for Jean Workroom. Produce concise, usable React/Next.js artifacts and avoid external side effects.";
