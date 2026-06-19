import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import type { BridgeLocalActionRunMessage, BridgeTaskRunMessage } from "@jean/shared";

import type { BridgeAgentConfig, BridgeCheckConfig, BridgeSessionState } from "./config.js";
import { runMcpStdioTool } from "./mcp-stdio.js";
import { callRoomMcpTool } from "./workroom-http.js";

export type LocalAgentRunResult = {
  summary: string | null;
  metadata: Record<string, unknown>;
};

type ActiveRun = {
  controller: AbortController;
  taskId: string;
};

export class LocalAgentRunner {
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(
    private readonly agent: BridgeAgentConfig,
    private readonly session: BridgeSessionState
  ) {}

  async run(message: BridgeTaskRunMessage): Promise<LocalAgentRunResult> {
    const controller = new AbortController();

    this.activeRuns.set(message.requestId, {
      controller,
      taskId: message.taskId
    });

    try {
      return await this.runWithController(message, controller);
    } finally {
      this.activeRuns.delete(message.requestId);
    }
  }

  async runLocalAction(message: BridgeLocalActionRunMessage): Promise<LocalAgentRunResult> {
    if (message.actionType === "apply_artifact_files") {
      return this.applyArtifactFiles(message);
    }

    return this.runConfiguredCheck(message);
  }

  cancel(requestId: string, reason: string): boolean {
    const activeRun = this.activeRuns.get(requestId);

    if (!activeRun) {
      return false;
    }

    activeRun.controller.abort(reason);

    return true;
  }

  private async runWithController(
    message: BridgeTaskRunMessage,
    controller: AbortController
  ): Promise<LocalAgentRunResult> {
    const tool = <TContent extends Record<string, unknown> = Record<string, unknown>>(
      toolName: string,
      args: Record<string, unknown>
    ) =>
      callRoomMcpTool<TContent>({
        mcpHttpUrl: message.mcpHttpUrl,
        token: this.session.token,
        toolName,
        arguments: args
      });

    await tool("room.get_context_pack", {
      roomId: message.roomId,
      taskId: message.taskId
    });
    await tool("agent.claim_task", {
      roomId: message.roomId,
      agentId: this.session.agentId,
      taskId: message.taskId
    });
    await tool("room.append_log", {
      roomId: message.roomId,
      taskId: message.taskId,
      message: `${this.agent.name} a pris la tâche via jean-bridge.`
    });

    const artifactContent =
      this.agent.transport === "mock"
        ? await this.runMockAgent(message)
        : await this.runMcpStdioAgent(message, controller.signal);

    await tool("room.write_artifact", {
      roomId: message.roomId,
      artifactId: message.artifactId,
      title: message.title,
      status: "READY",
      content: artifactContent
    });
    await tool("room.append_log", {
      roomId: message.roomId,
      taskId: message.taskId,
      message: `${this.agent.name} a publié l'artifact.`
    });

    return {
      summary: readTextSummary(artifactContent),
      metadata: {
        localAgentKey: this.agent.localAgentKey,
        transport: this.agent.transport
      }
    };
  }

  private async runMockAgent(message: BridgeTaskRunMessage): Promise<Record<string, unknown>> {
    return {
      text: `Artifact local mock pour: ${message.objective}`,
      files: [
        {
          path: "README.md",
          content: `# ${message.title}\n\nObjectif: ${message.objective}\n\nGénéré par jean-bridge mock.`
        }
      ],
      source: {
        bridge: "jean-bridge",
        localAgentKey: this.agent.localAgentKey,
        transport: "mock"
      }
    };
  }

  private async applyArtifactFiles(message: BridgeLocalActionRunMessage): Promise<LocalAgentRunResult> {
    if (message.actionType !== "apply_artifact_files") {
      throw new Error(`Unsupported local action for apply: ${message.actionType}`);
    }

    if (!this.agent.cwd) {
      throw new Error("Local apply requires a configured agent cwd.");
    }

    const rootDir = path.resolve(this.agent.cwd);

    for (const file of message.files) {
      const targetPath = resolveLocalArtifactPath(rootDir, file.path);

      await mkdir(path.dirname(targetPath), {
        recursive: true
      });
      await writeFile(targetPath, file.content, "utf8");
    }

    return {
      summary: `Applied ${message.files.length} file${message.files.length > 1 ? "s" : ""} to ${rootDir}.`,
      metadata: {
        actionType: message.actionType,
        artifactId: message.artifactId,
        fileCount: message.files.length,
        localAgentKey: this.agent.localAgentKey,
        targetRoot: rootDir
      }
    };
  }

  private async runConfiguredCheck(
    message: Extract<BridgeLocalActionRunMessage, { actionType: "run_check" }>
  ): Promise<LocalAgentRunResult> {
    const check = this.agent.checks[message.checkName];

    if (!check) {
      throw new Error(`Local check is not configured: ${message.checkName}`);
    }

    const cwd = path.resolve(check.cwd ?? this.agent.cwd ?? process.cwd());
    const result = await runLocalCheckCommand(check, cwd, message.timeoutMs);

    return {
      summary: `Check ${message.checkName} passed.`,
      metadata: {
        actionType: message.actionType,
        artifactId: message.artifactId,
        checkName: message.checkName,
        command: check.command,
        args: check.args,
        cwd,
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout
      }
    };
  }

  private async runMcpStdioAgent(
    message: BridgeTaskRunMessage,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    if (!this.agent.command) {
      throw new Error(`Local agent ${this.agent.localAgentKey} has no command.`);
    }

    const mcpResult = await runMcpStdioTool({
      command: this.agent.command,
      args: this.agent.args,
      framing: this.agent.framing,
      cwd: this.agent.cwd,
      toolName: "codex",
      toolArguments: {
        prompt: buildCodexPrompt(message),
        "approval-policy": this.agent.codex.approvalPolicy,
        sandbox: this.agent.codex.sandbox,
        ...(this.agent.cwd ? { cwd: this.agent.cwd } : {}),
        ...(this.agent.codex.model ? { model: this.agent.codex.model } : {}),
        ...(this.agent.codex.config ? { config: this.agent.codex.config } : {}),
        ...(this.agent.codex.baseInstructions ? { "base-instructions": this.agent.codex.baseInstructions } : {}),
        ...(this.agent.codex.developerInstructions
          ? { "developer-instructions": this.agent.codex.developerInstructions }
          : {}),
        ...(this.agent.codex.compactPrompt ? { "compact-prompt": this.agent.codex.compactPrompt } : {})
      },
      signal
    });
    const codexText = readCodexText(mcpResult);
    const artifactContent = parseArtifactContent(codexText);

    return {
      ...artifactContent,
      codex: {
        threadId: readNestedString(mcpResult, "structuredContent", "threadId"),
        transport: "mcp_stdio"
      }
    };
  }
}

function buildCodexPrompt(message: BridgeTaskRunMessage): string {
  return [
    "Tu es Codex local, appelé par jean-bridge pour produire un artifact de room.",
    "Tu ne dois pas parler au frontend. Le bridge publiera ton résultat via le Room MCP HTTP.",
    "Retourne uniquement un JSON valide, sans markdown, avec cette forme:",
    '{"text":"résumé court","files":[{"path":"README.md","content":"..."}]}',
    "",
    `Room: ${message.roomId}`,
    `Task: ${message.taskId}`,
    `Titre: ${message.title}`,
    `Type: ${message.taskType}`,
    `Objectif: ${message.objective}`,
    message.description ? `Description: ${message.description}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function parseArtifactContent(text: string): Record<string, unknown> {
  const jsonText = extractJson(text);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as unknown;

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to text content.
    }
  }

  return {
    text
  };
}

function extractJson(text: string): string | null {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  return fenced?.[1]?.trim() ?? null;
}

function readCodexText(result: Record<string, unknown>): string {
  const structuredContent = readRecord(result, "structuredContent");
  const structuredText = readString(structuredContent, "content");

  if (structuredText) {
    return structuredText;
  }

  const content = result.content;

  if (Array.isArray(content)) {
    const textParts = content
      .map((item) => (isRecord(item) && item.type === "text" && typeof item.text === "string" ? item.text : null))
      .filter(isPresent);

    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  return JSON.stringify(result);
}

function readTextSummary(content: Record<string, unknown>): string | null {
  return typeof content.text === "string" ? content.text.slice(0, 500) : null;
}

function readNestedString(record: Record<string, unknown>, firstKey: string, secondKey: string): string | null {
  const nested = readRecord(record, firstKey);

  return readString(nested, secondKey);
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];

  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

function resolveLocalArtifactPath(rootDir: string, relativePath: string): string {
  const normalizedPath = relativePath.trim().replace(/\\/g, "/");

  if (!normalizedPath || normalizedPath.startsWith("/") || normalizedPath.split("/").includes("..")) {
    throw new Error(`Unsafe artifact path: ${relativePath}`);
  }

  const targetPath = path.resolve(rootDir, normalizedPath);
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;

  if (targetPath !== rootDir && !targetPath.startsWith(rootPrefix)) {
    throw new Error(`Artifact path escapes the local workspace: ${relativePath}`);
  }

  return targetPath;
}

function runLocalCheckCommand(
  check: BridgeCheckConfig,
  cwd: string,
  messageTimeoutMs: number
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const timeoutMs = Math.min(check.timeoutMs ?? messageTimeoutMs, messageTimeoutMs);

  return new Promise((resolve, reject) => {
    const child = spawn(check.command, check.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Local check timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout = truncateCheckOutput(`${stdout}${chunk.toString()}`);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = truncateCheckOutput(`${stderr}${chunk.toString()}`);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timeout);

      if (exitCode !== 0) {
        reject(new Error(`Local check failed with exit code ${exitCode ?? "unknown"}: ${stderr || stdout || "no output"}`));
        return;
      }

      resolve({
        exitCode: exitCode ?? 0,
        stderr,
        stdout
      });
    });
  });
}

function truncateCheckOutput(value: string): string {
  if (value.length <= 4000) {
    return value;
  }

  return value.slice(value.length - 4000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
