import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type JsonRpcId = string | number;

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type McpStdioToolInput = {
  command: string;
  args: string[];
  framing: "jsonl" | "content_length";
  cwd: string | null;
  toolName: string;
  toolArguments: Record<string, unknown>;
  signal: AbortSignal;
};

export async function runMcpStdioTool(input: McpStdioToolInput): Promise<Record<string, unknown>> {
  const client = new McpStdioClient(input.command, input.args, input.framing, input.cwd, input.signal);

  try {
    await client.start();
    await client.initialize();

    const toolResult = await client.request("tools/call", {
      name: input.toolName,
      arguments: input.toolArguments
    });

    return normalizeRecord(toolResult);
  } finally {
    client.stop();
  }
}

class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private nextId = 1;
  private stderrTail = "";
  private readonly pending = new Map<JsonRpcId, PendingRequest>();

  constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly framing: "jsonl" | "content_length",
    private readonly cwd: string | null,
    private readonly signal: AbortSignal
  ) {}

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    this.child = spawn(this.command, this.args, {
      cwd: this.cwd ?? undefined,
      env: process.env
    });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.handleStdout(chunk);
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString("utf8")}`.slice(-4000);
    });
    this.child.once("error", (error) => {
      this.rejectAll(error);
    });
    this.child.once("exit", (code, signal) => {
      if (this.pending.size > 0) {
        this.rejectAll(
          new Error(`MCP stdio process exited before completing requests (code ${code ?? "null"}, signal ${signal ?? "null"}).`)
        );
      }
    });
    this.signal.addEventListener("abort", () => {
      this.stop("SIGTERM");
      this.rejectAll(new Error("MCP stdio run was canceled."));
    }, {
      once: true
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "jean-bridge",
        version: "0.1.0"
      }
    });
    this.notify("notifications/initialized", {});
  }

  request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.child) {
      return Promise.reject(new Error("MCP stdio process is not started."));
    }

    const id = this.nextId++;
    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject
      });
      this.writeMessage(message);
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.writeMessage({
      jsonrpc: "2.0",
      method,
      params
    });
  }

  stop(signal: NodeJS.Signals = "SIGTERM"): void {
    if (!this.child || this.child.killed) {
      return;
    }

    this.child.kill(signal);
  }

  private writeMessage(message: JsonRpcMessage): void {
    if (!this.child) {
      throw new Error("MCP stdio process is not started.");
    }

    const body = JSON.stringify(message);

    if (this.framing === "jsonl") {
      this.child.stdin.write(`${body}\n`);
      return;
    }

    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;

    this.child.stdin.write(`${header}${body}`);
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);

    if (this.framing === "jsonl") {
      this.handleJsonlStdout();
      return;
    }

    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      const header = this.stdoutBuffer.slice(0, headerEnd).toString("utf8");
      const contentLength = readContentLength(header);

      if (contentLength === null) {
        this.rejectAll(new Error("MCP stdio response is missing Content-Length."));
        return;
      }

      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.stdoutBuffer.length < bodyEnd) {
        return;
      }

      const body = this.stdoutBuffer.slice(bodyStart, bodyEnd).toString("utf8");
      this.stdoutBuffer = this.stdoutBuffer.slice(bodyEnd);
      this.handleMessage(JSON.parse(body) as JsonRpcMessage);
    }
  }

  private handleJsonlStdout(): void {
    while (true) {
      const lineEnd = this.stdoutBuffer.indexOf("\n");

      if (lineEnd === -1) {
        return;
      }

      const line = this.stdoutBuffer.slice(0, lineEnd).toString("utf8").trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(lineEnd + 1);

      if (line) {
        this.handleMessage(JSON.parse(line) as JsonRpcMessage);
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id === undefined) {
      return;
    }

    if (message.method) {
      this.writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: "Method not found."
        }
      });
      return;
    }

    const pending = this.pending.get(message.id);

    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`${message.error.message}${this.stderrTail ? `\n${this.stderrTail}` : ""}`));
      return;
    }

    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }
}

function readContentLength(header: string): number | null {
  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^Content-Length:\s*(\d+)$/i);

    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {
    value
  };
}
