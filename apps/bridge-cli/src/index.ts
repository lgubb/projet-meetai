#!/usr/bin/env node

import { spawn } from "node:child_process";
import { healthStatusSchema, type HealthStatus } from "@jean/shared";

import {
  bridgeSessionKey,
  loadBridgeConfig,
  readBridgeState,
  writePairedCodexConfig,
  writeBridgeState,
  type BridgeConfig,
  type BridgeSessionState,
  type BridgeState
} from "./config.js";
import { startBridge } from "./bridge-client.js";
import {
  consumeLocalCodexPairingCode,
  createRoomAgentSession,
  reportLocalCodexPairingError
} from "./workroom-http.js";

export function run(): HealthStatus {
  return {
    service: "bridge-cli",
    ok: true
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "jean-bridge failed");
    process.exitCode = 1;
  });
}

async function main(argv: string[]): Promise<void> {
  const { configPath, args } = parseGlobalArgs(argv);
  const command = args[0] ?? "help";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "pair") {
    await pairCodexLocal(args.slice(1), configPath);
    return;
  }

  if (command === "doctor") {
    await runDoctor(args.slice(1), configPath);
    return;
  }

  const config = await loadBridgeConfig(configPath);
  const state = await readBridgeState(config.homeDir);

  if (command === "login") {
    const nextState = await ensureAgentSessions(config, state);
    await writeBridgeState(config.homeDir, nextState);
    printAgentSessions(config, nextState.sessions);
    return;
  }

  if (command === "start") {
    const nextState = await ensureAgentSessions(config, state);
    await writeBridgeState(config.homeDir, nextState);
    await startBridge(config, nextState.sessions);
    return;
  }

  if (command === "agents" && args[1] === "list") {
    printAgentSessions(config, state.sessions);
    return;
  }

  throw new Error(`Unknown jean-bridge command: ${args.join(" ")}`);
}

async function pairCodexLocal(argv: string[], configPath?: string): Promise<void> {
  const options = parsePairArgs(argv);

  try {
    await assertCodexReady("codex");
  } catch (error) {
    await reportLocalCodexPairingError({
      apiUrl: options.apiUrl,
      code: options.code,
      status: "CODEX_AUTH_ERROR",
      message: errorMessage(error)
    });
    throw error;
  }

  try {
    const pairing = await consumeLocalCodexPairingCode({
      apiUrl: options.apiUrl,
      code: options.code
    });
    const config = await writePairedCodexConfig(configPath, {
      apiUrl: options.apiUrl,
      roomId: pairing.roomId,
      agent: pairing.agent
    });
    const state = await readBridgeState(config.homeDir);
    const pairedSession = {
      ...pairing.session,
      apiUrl: config.apiUrl
    };
    const nextState = {
      sessions: {
        ...state.sessions,
        [bridgeSessionKey({
          apiUrl: config.apiUrl,
          roomId: config.roomId,
          localAgentKey: pairing.agent.localAgentKey
        })]: pairedSession
      }
    };

    await writeBridgeState(config.homeDir, nextState);
    console.log(`[${pairing.agent.localAgentKey}] paired ${pairing.agent.name} with room ${pairing.roomId}`);

    if (options.start) {
      await startBridge(config, nextState.sessions);
    } else {
      console.log("Run jean-bridge start to connect this machine to the room.");
    }
  } catch (error) {
    await reportLocalCodexPairingError({
      apiUrl: options.apiUrl,
      code: options.code,
      status: "BRIDGE_ERROR",
      message: errorMessage(error)
    });
    throw error;
  }
}

async function runDoctor(argv: string[], configPath?: string): Promise<void> {
  const options = parseDoctorArgs(argv);
  const apiUrl = options.skipApi ? null : options.apiUrl ?? (await readConfiguredApiUrl(configPath));
  let failed = false;

  failed = !(await runDoctorCheck("Node.js WebSocket runtime", async () => {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("This Node.js runtime does not expose WebSocket. Use Node.js 22.12 or newer.");
    }
  })) || failed;

  if (options.skipCodex) {
    console.log("[skip] Codex CLI local auth");
  } else {
    failed = !(await runDoctorCheck("Codex CLI local auth", () => assertCodexReady("codex"))) || failed;
  }

  if (apiUrl) {
    failed = !(await runDoctorCheck(`Workroom API health (${apiUrl})`, () => checkApiHealth(apiUrl))) || failed;
  } else {
    console.log(
      options.skipApi
        ? "[skip] Workroom API health"
        : "[skip] Workroom API health (pass --api-url or configure jean-bridge first)"
    );
  }

  if (failed) {
    throw new Error("jean-bridge doctor failed.");
  }
}

async function runDoctorCheck(label: string, check: () => Promise<void> | void): Promise<boolean> {
  try {
    await check();
    console.log(`[ok] ${label}`);

    return true;
  } catch (error) {
    console.error(`[fail] ${label}: ${errorMessage(error)}`);

    return false;
  }
}

async function readConfiguredApiUrl(configPath?: string): Promise<string | null> {
  try {
    return (await loadBridgeConfig(configPath)).apiUrl;
  } catch (error) {
    if (isFileNotFound(error)) {
      return null;
    }

    throw error;
  }
}

async function checkApiHealth(apiUrl: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    const response = await fetch(new URL("/health", apiUrl), {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Health request failed with ${response.status}.`);
    }

    const health = healthStatusSchema.parse(await response.json());

    if (!health.ok) {
      throw new Error(`Health check returned ok=false for ${health.service}.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureAgentSessions(config: BridgeConfig, state: BridgeState): Promise<BridgeState> {
  const sessions = {
    ...state.sessions
  };

  for (const agent of config.agents) {
    const key = bridgeSessionKey({
      apiUrl: config.apiUrl,
      roomId: config.roomId,
      localAgentKey: agent.localAgentKey
    });

    if (sessions[key]) {
      continue;
    }

    const session = await createRoomAgentSession(config, agent);
    sessions[key] = session;
    console.log(`[${agent.localAgentKey}] created room-scoped agent session for ${session.agentName}`);
  }

  return {
    sessions
  };
}

function printAgentSessions(config: BridgeConfig, sessions: Record<string, BridgeSessionState>): void {
  for (const agent of config.agents) {
    const key = bridgeSessionKey({
      apiUrl: config.apiUrl,
      roomId: config.roomId,
      localAgentKey: agent.localAgentKey
    });
    const session = sessions[key];
    const status = session ? `registered as ${session.agentName} (${session.agentId})` : "not logged in";

    console.log(`${agent.localAgentKey}\t${agent.provider}/${agent.transport}\t${status}`);
  }
}

export function parseGlobalArgs(argv: string[]): { configPath?: string; args: string[] } {
  const args = [...argv];
  let configPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      args.splice(index, 1);
      index -= 1;
      continue;
    }

    if (arg === "--config") {
      configPath = args[index + 1];
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg?.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      args.splice(index, 1);
      index -= 1;
    }
  }

  return {
    configPath,
    args
  };
}

function parsePairArgs(argv: string[]): { apiUrl: string; code: string; start: boolean } {
  const args = [...argv];
  let apiUrl: string | undefined;
  let code: string | undefined;
  let start = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--api-url") {
      apiUrl = args[index + 1];
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg?.startsWith("--api-url=")) {
      apiUrl = arg.slice("--api-url=".length);
      args.splice(index, 1);
      index -= 1;
      continue;
    }

    if (arg === "--code") {
      code = args[index + 1];
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg?.startsWith("--code=")) {
      code = arg.slice("--code=".length);
      args.splice(index, 1);
      index -= 1;
      continue;
    }

    if (arg === "--no-start") {
      start = false;
      args.splice(index, 1);
      index -= 1;
    }
  }

  if (!apiUrl) {
    throw new Error("Missing --api-url for jean-bridge pair.");
  }

  if (!code) {
    throw new Error("Missing --code for jean-bridge pair.");
  }

  if (args.length > 0) {
    throw new Error(`Unknown jean-bridge pair option: ${args.join(" ")}`);
  }

  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    code,
    start
  };
}

export function parseDoctorArgs(argv: string[]): { apiUrl?: string; skipApi: boolean; skipCodex: boolean } {
  const args = [...argv];
  let apiUrl: string | undefined;
  let skipApi = false;
  let skipCodex = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--api-url") {
      apiUrl = args[index + 1];
      args.splice(index, 2);
      index -= 1;
      continue;
    }

    if (arg?.startsWith("--api-url=")) {
      apiUrl = arg.slice("--api-url=".length);
      args.splice(index, 1);
      index -= 1;
      continue;
    }

    if (arg === "--skip-codex") {
      skipCodex = true;
      args.splice(index, 1);
      index -= 1;
      continue;
    }

    if (arg === "--skip-api") {
      skipApi = true;
      args.splice(index, 1);
      index -= 1;
    }
  }

  if (apiUrl === "") {
    throw new Error("Invalid empty --api-url for jean-bridge doctor.");
  }

  if (args.length > 0) {
    throw new Error(`Unknown jean-bridge doctor option: ${args.join(" ")}`);
  }

  return {
    ...(apiUrl ? { apiUrl: apiUrl.replace(/\/$/, "") } : {}),
    skipApi,
    skipCodex
  };
}

async function assertCodexReady(command: string): Promise<void> {
  await runLocalCommand(command, ["--version"], 5000, "Codex CLI is not installed or not available in PATH.");
  await runLocalCommand(
    command,
    ["doctor", "--json"],
    20000,
    "Codex local auth check failed. Run codex login, or codex login --device-auth on a headless machine."
  );
}

function runLocalCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  failureMessage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${failureMessage} Timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`${failureMessage} ${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${failureMessage}${stderr.trim() ? ` ${stderr.trim()}` : ""}`));
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown bridge error.";
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function printHelp(): void {
  console.log(`jean-bridge

Commands:
  jean-bridge pair --api-url <url> --code <code>
                             Pair Codex Local from the room UI and start the bridge.
  jean-bridge doctor         Check local runtime, Codex auth, and Workroom API health.
  jean-bridge login          Create room-scoped local agent sessions.
  jean-bridge start          Connect local agents to the room bridge.
  jean-bridge agents list    Show configured local agents and session status.

Options:
  --config <path>            Defaults to ~/.jean-bridge/config.yaml or JEAN_BRIDGE_CONFIG.
  doctor --api-url <url>     Check a Workroom API before pairing.
  doctor --skip-api          Skip Workroom API health checks.
  doctor --skip-codex        Skip Codex CLI auth checks for non-Codex agents.
`);
}
