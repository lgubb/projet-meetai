#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridgeRequire = createRequire(join(repoRoot, "apps/bridge-cli/package.json"));
const workDir = mkdtempSync(join(tmpdir(), "jean-bridge-package-smoke-"));
const packDir = join(workDir, "packs");
const consumerDir = join(workDir, "consumer");

mkdirSync(packDir);
mkdirSync(consumerDir);

let keepWorkDir = true;

try {
  run("pnpm", ["--filter", "@jean/shared", "build"], repoRoot);
  run("pnpm", ["--filter", "@jean/bridge-cli", "build"], repoRoot);
  runQuiet("pnpm", ["--filter", "@jean/shared", "pack", "--pack-destination", packDir], repoRoot);
  runQuiet("pnpm", ["--filter", "@jean/bridge-cli", "pack", "--pack-destination", packDir], repoRoot);
  runQuiet("pnpm", ["pack", "--pack-destination", packDir], dirname(bridgeRequire.resolve("yaml/package.json")));
  runQuiet("pnpm", ["pack", "--pack-destination", packDir], dirname(bridgeRequire.resolve("zod/package.json")));

  const sharedTarball = findTarball("jean-shared");
  const bridgeTarball = findTarball("jean-bridge-cli");
  const yamlTarball = findTarball("yaml");
  const zodTarball = findTarball("zod");
  const bridgePackage = JSON.parse(runCapture("tar", ["-xOf", bridgeTarball, "package/package.json"], repoRoot));
  const bridgeTarList = runCapture("tar", ["-tzf", bridgeTarball], repoRoot).split("\n");

  assert(bridgePackage.bin?.["jean-bridge"] === "./dist/index.js", "bridge tarball does not expose jean-bridge bin");
  assert(
    bridgePackage.dependencies?.["@jean/shared"] === bridgePackage.version,
    "bridge tarball must depend on the versioned @jean/shared package"
  );
  assert(
    !JSON.stringify(bridgePackage).includes("workspace:"),
    "bridge tarball package.json must not contain workspace dependencies"
  );
  assert(!bridgeTarList.some((entry) => entry.includes(".test.")), "bridge tarball must not include compiled tests");

  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        name: "jean-bridge-package-smoke",
        private: true,
        type: "module",
        dependencies: {
          "@jean/bridge-cli": `file:${bridgeTarball}`,
          "@jean/shared": `file:${sharedTarball}`
        }
      },
      null,
      2
    )}\n`
  );
  writeFileSync(
    join(consumerDir, "pnpm-workspace.yaml"),
    [
      "packages:",
      "  - .",
      "overrides:",
      `  "@jean/shared": "file:${sharedTarball}"`,
      `  "yaml": "file:${yamlTarball}"`,
      `  "zod": "file:${zodTarball}"`,
      ""
    ].join("\n")
  );

  run("pnpm", ["install", "--offline", "--ignore-scripts"], consumerDir);

  const help = runCapture("pnpm", ["exec", "jean-bridge", "help"], consumerDir);
  assert(help.includes("jean-bridge doctor"), "installed jean-bridge help is missing doctor command");
  assert(help.includes("jean-bridge pair"), "installed jean-bridge help is missing pair command");
  assert(help.includes("jean-bridge start"), "installed jean-bridge help is missing start command");
  assert(help.includes("jean-bridge agents list"), "installed jean-bridge help is missing agents list command");

  const sharedImport = runCapture(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('@jean/shared').then((m) => { if (!m.agentProviderSchema || !m.bridgeClientMessageSchema) throw new Error('missing shared exports'); console.log('shared imports ok'); })"
    ],
    consumerDir
  );
  assert(sharedImport.includes("shared imports ok"), "installed @jean/shared import smoke failed");

  await runPackagedBridgeRuntimeSmoke(consumerDir);

  keepWorkDir = Boolean(process.env.JEAN_BRIDGE_KEEP_SMOKE_DIR);
  console.log("Bridge package smoke passed");
} finally {
  if (keepWorkDir) {
    console.log(`Bridge package smoke workdir kept at ${workDir}`);
  } else if (existsSync(workDir)) {
    rmSync(workDir, {
      recursive: true,
      force: true
    });
  }
}

async function runPackagedBridgeRuntimeSmoke(consumerDir) {
  const bridgeHome = join(consumerDir, ".jean-bridge-smoke");
  const binDir = join(consumerDir, "bin");
  const configPath = join(bridgeHome, "config.yaml");
  const pairingCode = "jcp_package_smoke";
  const roomId = "room-package-smoke";
  const agentId = "agent-package-smoke";
  const token = "room_agent_package_smoke";
  const protocolVersion = runCapture(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import('@jean/shared').then((m) => console.log(m.bridgeProtocolVersion))"
    ],
    consumerDir
  ).trim();

  mkdirSync(binDir);
  writeFakeCodexBinary(join(binDir, "codex"));
  assert(runCaptureEnv("codex", ["--version"], consumerDir, envWithPath(binDir)).includes("package-smoke"), "fake Codex binary was not resolved from PATH");
  assert(runCaptureEnv("codex", ["doctor", "--json"], consumerDir, envWithPath(binDir)).includes('"smoke":true'), "fake Codex doctor did not pass");

  const smokeServer = await startMockWorkroomServer({
    protocolVersion,
    pairingCode,
    roomId,
    agentId,
    token
  });
  const env = {
    ...envWithPath(binDir),
    JEAN_BRIDGE_HOME: bridgeHome
  };

  try {
    const doctorOutput = await runCaptureProcess(
      "pnpm",
      ["exec", "jean-bridge", "doctor", "--api-url", smokeServer.apiUrl],
      consumerDir,
      env,
      15000
    );

    assert(doctorOutput.includes("[ok] Node.js WebSocket runtime"), "packaged doctor did not verify WebSocket runtime");
    assert(doctorOutput.includes("[ok] Codex CLI local auth"), "packaged doctor did not verify fake Codex auth");
    assert(doctorOutput.includes("[ok] Workroom API health"), "packaged doctor did not verify Workroom API health");

    const pairOutput = await runCaptureProcess(
      "pnpm",
      [
        "exec",
        "jean-bridge",
        "--config",
        configPath,
        "pair",
        "--api-url",
        smokeServer.apiUrl,
        "--code",
        pairingCode,
        "--no-start"
      ],
      consumerDir,
      env,
      15000
    );

    assert(pairOutput.includes(`[codex] paired Codex Local Smoke with room ${roomId}`), "packaged pair did not complete");
    assert(pairOutput.includes("Run jean-bridge start"), "packaged pair did not stop before bridge start");

    const configText = readFileSync(configPath, "utf8");
    const stateText = readFileSync(join(bridgeHome, "state.json"), "utf8");

    assert(configText.includes(`apiUrl: ${smokeServer.apiUrl}`), "packaged pair did not write apiUrl to config");
    assert(configText.includes("command: codex"), "packaged pair did not write Codex command to config");
    assert(stateText.includes(token), "packaged pair did not persist the room-scoped session token");

    const bridgeProcess = spawn("pnpm", ["exec", "jean-bridge", "--config", configPath, "start"], {
      cwd: consumerDir,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const bridgeOutput = captureChildOutput(bridgeProcess);

    try {
      await smokeServer.waitForRun();
    } catch (error) {
      throw new Error(
        [
          errorMessage(error),
          bridgeOutput.stdout.trim() ? `bridge stdout:\n${bridgeOutput.stdout.trim()}` : null,
          bridgeOutput.stderr.trim() ? `bridge stderr:\n${bridgeOutput.stderr.trim()}` : null
        ]
          .filter(Boolean)
          .join("\n\n")
      );
    } finally {
      bridgeProcess.kill("SIGTERM");
      await waitForChildExit(bridgeProcess, 3000);
    }

    assert(smokeServer.state.helloReceived, "packaged bridge did not send bridge.hello");
    assert(smokeServer.state.taskAccepted, "packaged bridge did not accept the smoke task");
    assert(smokeServer.state.taskCompleted, "packaged bridge did not complete the smoke task");
    assert(
      smokeServer.state.toolCalls.includes("room.write_artifact"),
      "packaged bridge did not publish the artifact through Room MCP"
    );
    assert(
      smokeServer.state.artifactContent?.files?.[0]?.path === "README.md",
      "packaged bridge did not publish the fake Codex artifact files"
    );
    assert(
      bridgeOutput.stdout.includes("[codex] connected") && bridgeOutput.stdout.includes("[codex] registered"),
      "packaged bridge did not report WebSocket registration"
    );
  } finally {
    await smokeServer.close();
  }
}

function writeFakeCodexBinary(filePath) {
  writeFileSync(
    filePath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);

if (args[0] === "--version") {
  console.log("codex 0.0.0-package-smoke");
  process.exit(0);
}

if (args[0] === "doctor" && args[1] === "--json") {
  console.log(JSON.stringify({ ok: true, smoke: true }));
  process.exit(0);
}

if (args[0] !== "mcp-server") {
  console.error("unsupported fake codex command: " + args.join(" "));
  process.exit(1);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (buffer.includes("\\n")) {
    const index = buffer.indexOf("\\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      handle(JSON.parse(line));
    }
  }
});

function handle(message) {
  if (!message.id) {
    return;
  }

  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        serverInfo: {
          name: "fake-codex-package-smoke",
          version: "0.0.0"
        }
      }
    });
    return;
  }

  if (message.method === "tools/call") {
    const artifact = {
      text: "Smoke artifact from packaged jean-bridge.",
      files: [
        {
          path: "README.md",
          content: "# Package smoke\\n\\nGenerated by fake Codex MCP."
        }
      ]
    };
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        structuredContent: {
          content: JSON.stringify(artifact),
          threadId: "thread-package-smoke"
        },
        content: [
          {
            type: "text",
            text: JSON.stringify(artifact)
          }
        ]
      }
    });
    return;
  }

  send({
    jsonrpc: "2.0",
    id: message.id,
    error: {
      code: -32601,
      message: "Method not found."
    }
  });
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}
`
  );
  chmodSync(filePath, 0o755);
}

async function startMockWorkroomServer(options) {
  const sockets = new Set();
  const state = {
    artifactContent: null,
    helloReceived: false,
    taskAccepted: false,
    taskCompleted: false,
    toolCalls: []
  };
  let resolveRun;
  let rejectRun;
  const runPromise = new Promise((resolve, reject) => {
    resolveRun = resolve;
    rejectRun = reject;
  });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        service: "api",
        ok: true
      });
      return;
    }

    if (request.method === "POST" && url.pathname === `/local-codex/pairing-codes/${options.pairingCode}/consume`) {
      await readRequestJson(request);
      sendJson(response, 200, {
        roomId: options.roomId,
        agent: {
          localAgentKey: "codex",
          name: "Codex Local Smoke",
          provider: "CODEX",
          transport: "mcp_stdio",
          capabilities: ["CODE_GENERATION", "PROTOTYPING"],
          command: "codex",
          args: ["mcp-server"],
          framing: "jsonl",
          cwd: null,
          timeoutMs: 10000,
          metadata: {
            smoke: "package-runtime"
          },
          checks: {},
          codex: {
            approvalPolicy: "never",
            sandbox: "read-only"
          }
        },
        session: {
          apiUrl: apiUrl(),
          roomId: options.roomId,
          localAgentKey: "codex",
          agentId: options.agentId,
          agentName: "Codex Local Smoke",
          token: options.token,
          tokenType: "Bearer",
          createdAt: new Date().toISOString()
        }
      });
      return;
    }

    if (request.method === "POST" && url.pathname === `/local-codex/pairing-codes/${options.pairingCode}/error`) {
      await readRequestJson(request);
      sendJson(response, 200, {
        ok: true
      });
      return;
    }

    if (request.method === "POST" && url.pathname === `/rooms/${options.roomId}/mcp`) {
      const body = await readRequestJson(request);
      const toolName = body?.params?.name;
      const toolArguments = body?.params?.arguments ?? {};

      state.toolCalls.push(toolName);

      if (toolName === "room.write_artifact") {
        state.artifactContent = toolArguments.content ?? null;
      }

      sendJson(response, 200, {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          structuredContent: structuredContentForTool(toolName, toolArguments)
        }
      });
      return;
    }

    sendJson(response, 404, {
      error: "not found"
    });
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
  });

  server.on("upgrade", (request, socket) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname !== `/rooms/${options.roomId}/bridge` || url.searchParams.get("token") !== options.token) {
      socket.destroy();
      return;
    }

    const key = request.headers["sec-websocket-key"];

    if (typeof key !== "string") {
      socket.destroy();
      return;
    }

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
        "",
        ""
      ].join("\r\n")
    );

    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const parsed = parseWebSocketFrames(buffer);

      buffer = parsed.remaining;

      for (const frame of parsed.frames) {
        if (frame.opcode === 8) {
          socket.end();
          return;
        }

        if (frame.opcode !== 1) {
          continue;
        }

        const message = JSON.parse(frame.payload.toString("utf8"));

        if (message.type === "bridge.hello") {
          state.helloReceived = true;
          sendWebSocketJson(socket, {
            type: "bridge.ready",
            protocolVersion: options.protocolVersion,
            roomId: options.roomId,
            agentId: options.agentId,
            ts: new Date().toISOString()
          });
          sendWebSocketJson(socket, {
            type: "bridge.task.run",
            requestId: "request-package-smoke",
            roomId: options.roomId,
            taskId: "task-package-smoke",
            artifactId: "artifact-package-smoke",
            title: "Package smoke task",
            description: null,
            taskType: "code",
            artifactType: "CODE",
            objective: "Produce a package smoke artifact.",
            mcpHttpUrl: `${apiUrl()}/rooms/${options.roomId}/mcp`,
            timeoutMs: 10000,
            ts: new Date().toISOString()
          });
          continue;
        }

        if (message.type === "bridge.task.accepted") {
          state.taskAccepted = true;
          continue;
        }

        if (message.type === "bridge.task.completed") {
          state.taskCompleted = true;
          sendWebSocketClose(socket);
          resolveRun();
          continue;
        }

        if (message.type === "bridge.task.failed") {
          rejectRun(new Error(`Packaged bridge task failed: ${message.error}`));
        }
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  function apiUrl() {
    const address = server.address();

    assert(address && typeof address === "object", "mock Workroom server did not expose a TCP address");

    return `http://127.0.0.1:${address.port}`;
  }

  return {
    apiUrl: apiUrl(),
    state,
    waitForRun: () => withTimeout(runPromise, 15000, "Timed out waiting for packaged bridge runtime smoke."),
    close: () =>
      new Promise((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }

        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

function structuredContentForTool(toolName, toolArguments) {
  if (toolName === "room.get_context_pack") {
    return {
      room: {
        id: toolArguments.roomId,
        title: "Package smoke room"
      },
      task: {
        id: toolArguments.taskId,
        title: "Package smoke task"
      }
    };
  }

  if (toolName === "room.write_artifact") {
    return {
      artifact: {
        id: toolArguments.artifactId,
        status: "READY"
      }
    };
  }

  return {
    ok: true
  };
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.once("error", reject);
    request.once("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(response, statusCode, body) {
  const text = `${JSON.stringify(body)}\n`;

  response.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text)
  });
  response.end(text);
}

function createWebSocketAccept(key) {
  return createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
}

function parseWebSocketFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (buffer.length - offset >= 2) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let payloadLength = second & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (buffer.length - offset < 4) {
        break;
      }

      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (buffer.length - offset < 10) {
        break;
      }

      const longLength = buffer.readBigUInt64BE(offset + 2);

      assert(longLength <= BigInt(Number.MAX_SAFE_INTEGER), "WebSocket frame is too large for smoke parser");
      payloadLength = Number(longLength);
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;

    if (buffer.length - offset < frameLength) {
      break;
    }

    const mask = masked ? buffer.slice(offset + headerLength, offset + headerLength + 4) : null;
    const payloadStart = offset + headerLength + maskLength;
    const payload = Buffer.from(buffer.slice(payloadStart, payloadStart + payloadLength));

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    frames.push({
      opcode,
      payload
    });
    offset += frameLength;
  }

  return {
    frames,
    remaining: buffer.slice(offset)
  };
}

function sendWebSocketJson(socket, body) {
  sendWebSocketFrame(socket, 1, Buffer.from(JSON.stringify(body), "utf8"));
}

function sendWebSocketClose(socket) {
  sendWebSocketFrame(socket, 8, Buffer.alloc(0));
  socket.end();
}

function sendWebSocketFrame(socket, opcode, payload) {
  const first = 0x80 | opcode;

  if (payload.length < 126) {
    socket.write(Buffer.concat([Buffer.from([first, payload.length]), payload]));
    return;
  }

  if (payload.length <= 0xffff) {
    const header = Buffer.alloc(4);

    header[0] = first;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
    socket.write(Buffer.concat([header, payload]));
    return;
  }

  const header = Buffer.alloc(10);

  header[0] = first;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payload.length), 2);
  socket.write(Buffer.concat([header, payload]));
}

function captureChildOutput(child) {
  const output = {
    stdout: "",
    stderr: ""
  };

  child.stdout?.on("data", (chunk) => {
    output.stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr += chunk.toString();
  });

  return output;
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Child process did not exit after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);

      if (code === 0 || signal === "SIGTERM") {
        resolve();
        return;
      }

      reject(new Error(`Child process failed with code ${code ?? "null"} and signal ${signal ?? "null"}.`));
    });
  });
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error.";
}

function findTarball(prefix) {
  const fileName = readdirSync(packDir).find((entry) => entry.startsWith(prefix) && entry.endsWith(".tgz"));

  assert(fileName, `missing ${prefix} tarball`);

  return join(packDir, fileName);
}

function run(command, args, cwd) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: "1"
    },
    stdio: "inherit"
  });
}

function runCapture(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      CI: "1"
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
}

function envWithPath(binDir) {
  return {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`
  };
}

function runCaptureEnv(command, args, cwd, env, timeoutMs = 30000) {
  console.log(`$ ${[command, ...args].join(" ")}`);

  try {
    return execFileSync(command, args, {
      cwd,
      env: {
        ...env,
        CI: "1"
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs
    });
  } catch (error) {
    if (error.stdout) {
      process.stdout.write(error.stdout);
    }

    if (error.stderr) {
      process.stderr.write(error.stderr);
    }

    throw error;
  }
}

function runCaptureProcess(command, args, cwd, env, timeoutMs) {
  console.log(`$ ${[command, ...args].join(" ")}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...env,
        CI: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${[command, ...args].join(" ")}`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          [
            `Command failed with code ${code ?? "null"} and signal ${signal ?? "null"}: ${[command, ...args].join(" ")}`,
            stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
            stderr.trim() ? `stderr:\n${stderr.trim()}` : null
          ]
            .filter(Boolean)
            .join("\n\n")
        )
      );
    });
  });
}

function runQuiet(command, args, cwd) {
  console.log(`$ ${[command, ...args].join(" ")}`);

  try {
    execFileSync(command, args, {
      cwd,
      env: {
        ...process.env,
        CI: "1"
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    if (error.stdout) {
      process.stdout.write(error.stdout);
    }

    if (error.stderr) {
      process.stderr.write(error.stderr);
    }

    throw error;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
