import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bridgeSessionKey,
  getStatePath,
  loadBridgeConfig,
  readBridgeState,
  writePairedCodexConfig,
  writeBridgeState
} from "./config.js";

test("bridge config loads YAML agents with safe defaults", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "jean-bridge-config-"));
  const configPath = path.join(homeDir, "config.yaml");

  await fs.writeFile(
    configPath,
    [
      "apiUrl: http://127.0.0.1:3001",
      "roomId: room-1",
      "devUserEmail: owner@example.com",
      "agents:",
      "  codex:",
      "    transport: mock",
      "  codex-stdio:",
      "    provider: CODEX",
      "    transport: mcp_stdio",
      "    command: codex",
      "    args:",
      "      - mcp-server",
      "    checks:",
      "      test:",
      "        command: pnpm",
      "        args:",
      "          - test",
      "  claude:",
      "    provider: CLAUDE_CODE",
      "    transport: mock",
      "  v0:",
      "    provider: V0",
      "    transport: mock"
    ].join("\n")
  );

  const config = await loadBridgeConfig(configPath);

  assert.equal(config.apiUrl, "http://127.0.0.1:3001");
  assert.equal(config.wsUrl, "ws://127.0.0.1:3001");
  assert.equal(config.roomId, "room-1");
  assert.equal(config.devUserEmail, "owner@example.com");
  assert.deepEqual(
    config.agents.map((agent) => ({
      key: agent.localAgentKey,
      provider: agent.provider,
      transport: agent.transport,
      command: agent.command,
      framing: agent.framing,
      capabilities: agent.capabilities
    })),
    [
      {
        key: "codex",
        provider: "CODEX",
        transport: "mock",
        command: null,
        framing: "jsonl",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"]
      },
      {
        key: "codex-stdio",
        provider: "CODEX",
        transport: "mcp_stdio",
        command: "codex",
        framing: "jsonl",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"]
      },
      {
        key: "claude",
        provider: "CLAUDE_CODE",
        transport: "mock",
        command: null,
        framing: "content_length",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"]
      },
      {
        key: "v0",
        provider: "V0",
        transport: "mock",
        command: null,
        framing: "content_length",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"]
      }
    ]
  );
  assert.deepEqual(config.agents[1]?.checks.test, {
    command: "pnpm",
    args: ["test"],
    cwd: null,
    timeoutMs: null
  });
});

test("paired Codex config writes a product config without requiring YAML hand editing", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "jean-bridge-pair-"));
  const configPath = path.join(homeDir, "config.yaml");

  const config = await writePairedCodexConfig(configPath, {
    apiUrl: "http://127.0.0.1:3001",
    roomId: "room-1",
    agent: {
      localAgentKey: "codex",
      name: "Codex Local",
      provider: "CODEX",
      transport: "mcp_stdio",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"],
      command: "codex",
      args: ["mcp-server"],
      framing: "jsonl",
      cwd: null,
      timeoutMs: 900000,
      metadata: {
        bridge: "jean-bridge"
      },
      checks: {},
      codex: {
        approvalPolicy: "never",
        sandbox: "workspace-write"
      }
    }
  });
  const fileStat = await fs.stat(configPath);

  assert.equal(fileStat.mode & 0o777, 0o600);
  assert.equal(config.roomId, "room-1");
  assert.equal(config.agents[0]?.name, "Codex Local");
  assert.equal(config.agents[0]?.command, "codex");
  assert.deepEqual(config.agents[0]?.args, ["mcp-server"]);
});

test("bridge state round-trips sessions without leaking into the repo", async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "jean-bridge-state-"));
  const key = bridgeSessionKey({
    apiUrl: "http://127.0.0.1:3001",
    roomId: "room-1",
    localAgentKey: "codex"
  });

  await writeBridgeState(homeDir, {
    sessions: {
      [key]: {
        apiUrl: "http://127.0.0.1:3001",
        roomId: "room-1",
        localAgentKey: "codex",
        agentId: "agent-1",
        agentName: "Codex Local",
        token: "room_agent_secret",
        tokenType: "Bearer",
        createdAt: "2026-06-17T12:00:00.000Z"
      }
    }
  });

  const state = await readBridgeState(homeDir);
  const fileStat = await fs.stat(getStatePath(homeDir));

  assert.equal(state.sessions[key]?.agentId, "agent-1");
  assert.equal(fileStat.mode & 0o777, 0o600);
});
