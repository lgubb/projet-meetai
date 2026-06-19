import type { AgentTransport } from "@jean/shared";

import {
  bridgeSessionKey,
  type BridgeAgentConfig,
  type BridgeConfig,
  type BridgeSessionState
} from "./config.js";

type AgentSessionResponse = {
  agent: {
    id: string;
    name: string;
  };
  session: {
    token: string;
    tokenType: "Bearer";
  };
};

type LocalCodexPairingResponse = {
  roomId: string;
  agent: {
    localAgentKey: string;
    name: string;
    provider: "CODEX";
    transport: "mcp_stdio";
    capabilities: ["CODE_GENERATION", "PROTOTYPING"];
    command: string;
    args: string[];
    framing: "jsonl" | "content_length";
    cwd: string | null;
    timeoutMs: number;
    metadata: Record<string, unknown>;
    checks: BridgeAgentConfig["checks"];
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
  session: BridgeSessionState;
};

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: string;
  result: {
    structuredContent?: Record<string, unknown>;
  };
};

type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: string | null;
  error: {
    code: number;
    message: string;
  };
};

export async function createRoomAgentSession(
  config: BridgeConfig,
  agent: BridgeAgentConfig
): Promise<BridgeSessionState> {
  const response = await fetch(new URL(`/rooms/${config.roomId}/agent-sessions`, config.apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...devAuthHeaders(config)
    },
    body: JSON.stringify({
      name: agent.name,
      provider: agent.provider,
      transport: roomTransportForAgent(agent),
      capabilities: agent.capabilities,
      metadata: {
        ...agent.metadata,
        bridge: "jean-bridge",
        localAgentKey: agent.localAgentKey,
        localTransport: agent.transport
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Agent session creation failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as AgentSessionResponse;

  return {
    apiUrl: config.apiUrl,
    roomId: config.roomId,
    localAgentKey: agent.localAgentKey,
    agentId: body.agent.id,
    agentName: body.agent.name,
    token: body.session.token,
    tokenType: body.session.tokenType,
    createdAt: new Date().toISOString()
  };
}

export async function consumeLocalCodexPairingCode(input: {
  apiUrl: string;
  code: string;
}): Promise<LocalCodexPairingResponse> {
  const response = await fetch(new URL(`/local-codex/pairing-codes/${encodeURIComponent(input.code)}/consume`, input.apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Codex local pairing failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as LocalCodexPairingResponse;
}

export async function reportLocalCodexPairingError(input: {
  apiUrl: string;
  code: string;
  status: "CODEX_AUTH_ERROR" | "BRIDGE_ERROR";
  message: string;
}): Promise<void> {
  await fetch(new URL(`/local-codex/pairing-codes/${encodeURIComponent(input.code)}/error`, input.apiUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      status: input.status,
      message: input.message
    })
  }).catch(() => undefined);
}

export async function callRoomMcpTool<TContent extends Record<string, unknown> = Record<string, unknown>>(input: {
  mcpHttpUrl: string;
  token: string;
  toolName: string;
  arguments: Record<string, unknown>;
}): Promise<TContent> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await fetch(input.mcpHttpUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: input.toolName,
        arguments: input.arguments
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Room MCP request failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as JsonRpcSuccess | JsonRpcFailure;

  if ("error" in body) {
    throw new Error(`Room MCP ${input.toolName} failed: ${body.error.message}`);
  }

  return (body.result.structuredContent ?? {}) as TContent;
}

export function requireSession(
  sessions: Record<string, BridgeSessionState>,
  config: BridgeConfig,
  agent: BridgeAgentConfig
): BridgeSessionState {
  const session = sessions[bridgeSessionKey({
    apiUrl: config.apiUrl,
    roomId: config.roomId,
    localAgentKey: agent.localAgentKey
  })];

  if (!session) {
    throw new Error(`Missing session for local agent ${agent.localAgentKey}. Run jean-bridge login first.`);
  }

  return session;
}

function devAuthHeaders(config: BridgeConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  if (config.devUserEmail) {
    headers["x-dev-user-email"] = config.devUserEmail;
  }

  if (config.devUserName) {
    headers["x-dev-user-name"] = config.devUserName;
  }

  return headers;
}

function roomTransportForAgent(agent: BridgeAgentConfig): AgentTransport {
  if (agent.transport === "mcp_stdio") {
    return "STDIO";
  }

  return "STDIO";
}
