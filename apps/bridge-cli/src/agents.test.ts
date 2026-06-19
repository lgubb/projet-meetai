import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalAgentRunner } from "./agents.js";
import type { BridgeAgentConfig, BridgeSessionState } from "./config.js";

test("local action applies artifact files inside the configured cwd only", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "jean-bridge-apply-"));
  const runner = new LocalAgentRunner(createAgentConfig(cwd), createSessionState());

  t.after(async () => {
    await rm(cwd, {
      force: true,
      recursive: true
    });
  });

  const result = await runner.runLocalAction({
    type: "bridge.local_action.run",
    requestId: "local-action-1",
    roomId: "room-1",
    artifactId: "artifact-1",
    actionType: "apply_artifact_files",
    files: [
      {
        path: "src/index.html",
        content: "<main>Applied</main>",
        contentHash: "hash-1",
        size: 20
      }
    ],
    timeoutMs: 1000,
    ts: "2026-06-06T12:00:00.000Z"
  });

  assert.equal(await readFile(path.join(cwd, "src/index.html"), "utf8"), "<main>Applied</main>");
  assert.equal(result.metadata.fileCount, 1);

  await assert.rejects(
    runner.runLocalAction({
      type: "bridge.local_action.run",
      requestId: "local-action-2",
      roomId: "room-1",
      artifactId: "artifact-1",
      actionType: "apply_artifact_files",
      files: [
        {
          path: "../escape.txt",
          content: "escape",
          contentHash: "hash-2",
          size: 6
        }
      ],
      timeoutMs: 1000,
      ts: "2026-06-06T12:00:01.000Z"
    }),
    /Unsafe artifact path/
  );
});

test("local action runs only configured checks", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "jean-bridge-check-"));
  const runner = new LocalAgentRunner(
    {
      ...createAgentConfig(cwd),
      checks: {
        test: {
          command: process.execPath,
          args: ["-e", "console.log('check ok')"],
          cwd: null,
          timeoutMs: 1000
        }
      }
    },
    createSessionState()
  );

  t.after(async () => {
    await rm(cwd, {
      force: true,
      recursive: true
    });
  });

  const result = await runner.runLocalAction({
    type: "bridge.local_action.run",
    requestId: "local-action-check-1",
    roomId: "room-1",
    artifactId: "artifact-1",
    actionType: "run_check",
    checkName: "test",
    timeoutMs: 1000,
    ts: "2026-06-06T12:00:00.000Z"
  });

  assert.equal(result.summary, "Check test passed.");
  assert.equal(result.metadata.checkName, "test");

  await assert.rejects(
    runner.runLocalAction({
      type: "bridge.local_action.run",
      requestId: "local-action-check-2",
      roomId: "room-1",
      artifactId: "artifact-1",
      actionType: "run_check",
      checkName: "deploy",
      timeoutMs: 1000,
      ts: "2026-06-06T12:00:01.000Z"
    }),
    /Local check is not configured/
  );
});

function createAgentConfig(cwd: string): BridgeAgentConfig {
  return {
    localAgentKey: "codex",
    name: "Codex Local",
    provider: "CODEX",
    transport: "mock",
    capabilities: ["CODE_GENERATION"],
    command: null,
    args: [],
    framing: "jsonl",
    cwd,
    timeoutMs: 1000,
    metadata: {},
    checks: {},
    codex: {
      approvalPolicy: "never",
      sandbox: "workspace-write"
    }
  };
}

function createSessionState(): BridgeSessionState {
  return {
    apiUrl: "http://127.0.0.1:3001",
    roomId: "room-1",
    localAgentKey: "codex",
    agentId: "agent-1",
    agentName: "Codex Local",
    token: "token",
    tokenType: "Bearer",
    createdAt: "2026-06-06T12:00:00.000Z"
  };
}
