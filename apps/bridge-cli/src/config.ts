import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  agentCapabilitySchema,
  bridgeAgentTransportSchema,
  bridgeRunConfigSchema,
  type AgentCapability,
  type AgentProvider,
  type BridgeAgentTransport
} from "@jean/shared";
import { z } from "zod";

const persistedAgentProviderSchema = z.enum(["MCP", "CODEX", "CLAUDE_CODE", "LOVABLE", "V0", "PERPLEXITY", "E2B", "CUSTOM"]);

const defaultCodexConfig = {
  approvalPolicy: "never" as const,
  sandbox: "workspace-write" as const
};

const bridgeCheckConfigFileSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().max(1000 * 60 * 30).optional()
  })
  .strict();

const bridgeAgentConfigFileSchema = z
  .object({
    name: z.string().min(1).optional(),
    provider: persistedAgentProviderSchema.default("CODEX"),
    transport: bridgeAgentTransportSchema.default("mcp_stdio"),
    capabilities: z.array(agentCapabilitySchema).min(1).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).default([]),
    framing: z.enum(["jsonl", "content_length"]).optional(),
    cwd: z.string().min(1).optional(),
    timeoutMs: z.number().int().positive().max(1000 * 60 * 60).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    checks: z.record(z.string().min(1), bridgeCheckConfigFileSchema).default({}),
    codex: z
      .object({
        approvalPolicy: z.enum(["untrusted", "on-request", "never"]).default("never"),
        sandbox: z.enum(["read-only", "workspace-write", "danger-full-access"]).default("workspace-write"),
        model: z.string().min(1).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        baseInstructions: z.string().min(1).optional(),
        developerInstructions: z.string().min(1).optional(),
        compactPrompt: z.string().min(1).optional()
      })
      .strict()
      .default(defaultCodexConfig)
  })
  .strict()
  .superRefine((agent, context) => {
    if (agent.transport === "mcp_stdio" && !agent.command) {
      context.addIssue({
        code: "custom",
        path: ["command"],
        message: "command is required when transport is mcp_stdio"
      });
    }
  });

const bridgeConfigFileSchema = z
  .object({
    apiUrl: z.string().url().default("http://127.0.0.1:3001"),
    wsUrl: z.string().url().optional(),
    roomId: z.string().min(1),
    bridgeId: z.string().min(1).optional(),
    devUserEmail: z.string().email().optional(),
    devUserName: z.string().min(1).optional(),
    agents: z.record(z.string().min(1), bridgeAgentConfigFileSchema).refine((agents) => Object.keys(agents).length > 0, {
      message: "at least one local agent is required"
    })
  })
  .strict();

const bridgeSessionStateSchema = z
  .object({
    apiUrl: z.string().url(),
    roomId: z.string().min(1),
    localAgentKey: z.string().min(1),
    agentId: z.string().min(1),
    agentName: z.string().min(1),
    token: z.string().min(1),
    tokenType: z.literal("Bearer"),
    createdAt: z.string().datetime()
  })
  .strict();

const bridgeStateSchema = z
  .object({
    sessions: z.record(z.string(), bridgeSessionStateSchema).default({})
  })
  .strict();

export type BridgeCheckConfig = {
  command: string;
  args: string[];
  cwd: string | null;
  timeoutMs: number | null;
};

export type BridgeAgentConfig = {
  localAgentKey: string;
  name: string;
  provider: AgentProvider;
  transport: BridgeAgentTransport;
  capabilities: AgentCapability[];
  command: string | null;
  args: string[];
  framing: "jsonl" | "content_length";
  cwd: string | null;
  timeoutMs: number;
  metadata: Record<string, unknown>;
  checks: Record<string, BridgeCheckConfig>;
  codex: {
    approvalPolicy: "untrusted" | "on-request" | "never";
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    model?: string;
    config?: Record<string, unknown>;
    baseInstructions?: string;
    developerInstructions?: string;
    compactPrompt?: string;
  };
};

export type BridgeConfig = {
  path: string;
  homeDir: string;
  apiUrl: string;
  wsUrl: string;
  roomId: string;
  bridgeId: string;
  devUserEmail: string | null;
  devUserName: string | null;
  agents: BridgeAgentConfig[];
};

export type BridgeSessionState = z.infer<typeof bridgeSessionStateSchema>;
export type BridgeState = z.infer<typeof bridgeStateSchema>;

export type PairedCodexConfigInput = {
  apiUrl: string;
  wsUrl?: string;
  roomId: string;
  agent: BridgeAgentConfig;
};

export function getBridgeHome(): string {
  return process.env.JEAN_BRIDGE_HOME ?? path.join(os.homedir(), ".jean-bridge");
}

export function getDefaultConfigPath(): string {
  return process.env.JEAN_BRIDGE_CONFIG ?? path.join(getBridgeHome(), "config.yaml");
}

export function getStatePath(homeDir = getBridgeHome()): string {
  return path.join(homeDir, "state.json");
}

export async function loadBridgeConfig(configPath = getDefaultConfigPath()): Promise<BridgeConfig> {
  const rawConfig = await fs.readFile(configPath, "utf8");
  const parsedConfig = bridgeConfigFileSchema.parse(parseYaml(rawConfig));
  const homeDir = path.dirname(configPath);
  const agents = Object.entries(parsedConfig.agents).map(([localAgentKey, agent]) => ({
    localAgentKey,
    name: agent.name ?? defaultAgentName(localAgentKey, agent.provider),
    provider: agent.provider,
    transport: agent.transport,
    capabilities: agent.capabilities ?? defaultCapabilities(agent.transport, agent.provider),
    command: agent.command ?? null,
    args: agent.args,
    framing: agent.framing ?? (agent.provider === "CODEX" ? "jsonl" : "content_length"),
    cwd: agent.cwd ?? null,
    timeoutMs: agent.timeoutMs ?? bridgeRunConfigSchema.parse({}).timeoutMs,
    metadata: agent.metadata,
    checks: Object.fromEntries(
      Object.entries(agent.checks).map(([checkName, check]) => [
        checkName,
        {
          command: check.command,
          args: check.args,
          cwd: check.cwd ?? null,
          timeoutMs: check.timeoutMs ?? null
        }
      ])
    ),
    codex: agent.codex
  }));

  return {
    path: configPath,
    homeDir,
    apiUrl: parsedConfig.apiUrl,
    wsUrl: parsedConfig.wsUrl ?? toWebSocketUrl(parsedConfig.apiUrl),
    roomId: parsedConfig.roomId,
    bridgeId: parsedConfig.bridgeId ?? `${os.hostname()}-${process.pid}`,
    devUserEmail: parsedConfig.devUserEmail ?? null,
    devUserName: parsedConfig.devUserName ?? null,
    agents
  };
}

export async function readBridgeState(homeDir = getBridgeHome()): Promise<BridgeState> {
  try {
    const rawState = await fs.readFile(getStatePath(homeDir), "utf8");

    return bridgeStateSchema.parse(JSON.parse(rawState));
  } catch (error) {
    if (isFileNotFound(error)) {
      return {
        sessions: {}
      };
    }

    throw error;
  }
}

export async function writeBridgeState(homeDir: string, state: BridgeState): Promise<void> {
  await fs.mkdir(homeDir, {
    recursive: true,
    mode: 0o700
  });
  const statePath = getStatePath(homeDir);
  await fs.writeFile(statePath, `${JSON.stringify(bridgeStateSchema.parse(state), null, 2)}\n`, {
    mode: 0o600
  });
  await fs.chmod(statePath, 0o600);
}

export async function writePairedCodexConfig(
  configPath = getDefaultConfigPath(),
  input: PairedCodexConfigInput
): Promise<BridgeConfig> {
  const rawConfig = await readExistingConfig(configPath);
  const existingAgents = isRecord(rawConfig.agents) ? rawConfig.agents : {};
  const nextConfig = stripUndefined({
    ...rawConfig,
    apiUrl: input.apiUrl,
    wsUrl: input.wsUrl ?? toWebSocketUrl(input.apiUrl),
    roomId: input.roomId,
    agents: {
      ...existingAgents,
      [input.agent.localAgentKey]: stripUndefined({
        name: input.agent.name,
        provider: input.agent.provider,
        transport: input.agent.transport,
        capabilities: input.agent.capabilities,
        command: input.agent.command,
        args: input.agent.args,
        framing: input.agent.framing,
        cwd: input.agent.cwd ?? undefined,
        timeoutMs: input.agent.timeoutMs,
        metadata: input.agent.metadata,
        checks: input.agent.checks,
        codex: input.agent.codex
      })
    }
  });

  await fs.mkdir(path.dirname(configPath), {
    recursive: true,
    mode: 0o700
  });
  await fs.writeFile(configPath, stringifyYaml(nextConfig), {
    mode: 0o600
  });
  await fs.chmod(configPath, 0o600);

  return loadBridgeConfig(configPath);
}

export function bridgeSessionKey(input: { apiUrl: string; roomId: string; localAgentKey: string }): string {
  return `${input.apiUrl}|${input.roomId}|${input.localAgentKey}`;
}

function defaultAgentName(localAgentKey: string, provider: AgentProvider): string {
  if (provider === "CODEX") {
    return "Codex Local";
  }

  if (provider === "CLAUDE_CODE") {
    return "Claude Code";
  }

  if (provider === "LOVABLE") {
    return "Lovable";
  }

  if (provider === "V0") {
    return "v0";
  }

  return localAgentKey;
}

function defaultCapabilities(transport: BridgeAgentTransport, provider: AgentProvider): AgentCapability[] {
  if (transport === "mock") {
    return ["CODE_GENERATION", "PROTOTYPING"];
  }

  if (provider === "CODEX" || provider === "CLAUDE_CODE" || provider === "LOVABLE" || provider === "V0") {
    return ["CODE_GENERATION", "PROTOTYPING"];
  }

  return ["ARTIFACT_GENERATION"];
}

function toWebSocketUrl(apiUrl: string): string {
  const url = new URL(apiUrl);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return url.toString().replace(/\/$/, "");
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readExistingConfig(configPath: string): Promise<Record<string, unknown>> {
  try {
    const parsed = parseYaml(await fs.readFile(configPath, "utf8")) as unknown;

    if (!isRecord(parsed)) {
      throw new Error(`Invalid bridge config at ${configPath}.`);
    }

    return parsed;
  } catch (error) {
    if (isFileNotFound(error)) {
      return {};
    }

    throw error;
  }
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, Exclude<unknown, undefined>] => entry[1] !== undefined)
      .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
