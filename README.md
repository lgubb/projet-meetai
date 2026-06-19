# Workroom V1

Monorepo pnpm + Turborepo pour Workroom V1.

## Prerequisites

- Node.js 22.12 or newer
- pnpm 11.5 or newer

If pnpm is not available locally:

```bash
corepack enable pnpm
```

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

For the local Jean + voice + Perplexity loop, prefer:

```bash
pnpm dev:local
```

This starts the API, web app, and room worker with `WORKROOM_AUTH_MODE=dev`, so Clerk env vars can stay in `.envrc` without breaking local dev auth.
It also runs the room worker in `WORKROOM_ROOM_WORKER_MODE=mock` so the local smoke can start without LiveKit/Deepgram secrets. Use `pnpm dev:room-worker` with real `LIVEKIT_*` and `DEEPGRAM_API_KEY` when you want live transcription.

If you want separate terminals:

```bash
pnpm dev:api:local
pnpm dev:web
pnpm dev:room-worker
```

For Prisma migrations, provide `DATABASE_URL` before running `pnpm db:migrate` or `pnpm db:deploy`. With local Postgres over TCP, include the user explicitly, for example `DATABASE_URL=postgresql://$USER@localhost:5432/workroom`. See `.env.example` for the expected variable name.

The API uses Clerk when `CLERK_SECRET_KEY` is set, unless `WORKROOM_AUTH_MODE=dev` is set. Local API requests can use explicit dev auth headers:

```bash
x-dev-user-email: owner@example.com
x-dev-user-name: Owner
```

The web app proxies browser requests through `/api/workroom/*` to `WORKROOM_API_URL`, which defaults to `http://127.0.0.1:3001`.
Room event WebSockets use `NEXT_PUBLIC_WORKROOM_WS_URL`, which defaults locally to `ws://127.0.0.1:3001`.

Phase 2 LiveKit media requires:

```bash
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

Phase 3 transcription also requires:

```bash
WORKROOM_ROOM_ID
DEEPGRAM_API_KEY
DEEPGRAM_LANGUAGE=multi
DEEPGRAM_ENDPOINTING=100
WORKROOM_JEAN_VOICE_ENABLED=true
DEEPGRAM_TTS_MODEL=aura-2-thalia-en
DEEPGRAM_TTS_SAMPLE_RATE=16000
WORKROOM_JEAN_VOICE_MIN_INTERVAL_MS=2500
WORKROOM_WORKER_TOKEN
```

When `WORKROOM_JEAN_VOICE_ENABLED=true`, the room worker also listens to room `agent.speech` events and publishes short Jean voice confirmations back into LiveKit with Deepgram TTS. If TTS or audio publish fails, the text event remains the fallback.

Run one dev transcription worker for a room with:

```bash
pnpm dev:room-worker
```

Phase 6 Perplexity research requires:

```bash
PERPLEXITY_API_KEY
PERPLEXITY_MODEL=sonar-pro
```

Phase 7 E2B previews require:

```bash
E2B_API_KEY
```

Phase 8 Room MCP HTTP uses signed room-agent tokens. In dev auth mode, a deterministic local secret is used; outside dev, set:

```bash
WORKROOM_AGENT_TOKEN_SECRET
```

External agents should first create a room-scoped session with:

```text
POST /rooms/:roomId/agent-sessions
POST /rooms/:roomId/mcp
```

The MCP endpoint requires `Authorization: Bearer <room-agent-token>` and rejects tokens whose room, agent, or persisted session no longer match.

Phase 9 `jean-bridge` connects local agents to a room over an outbound WebSocket. The bridge stores room-scoped agent session tokens in `~/.jean-bridge/state.json` with file mode `0600`; tokens are not stored in the repo.

See [docs/bridge-installation.md](./docs/bridge-installation.md) for the alpha pairing and installation flow.

Example `~/.jean-bridge/config.yaml`:

```yaml
apiUrl: http://127.0.0.1:3001
roomId: dev-local-room
devUserEmail: owner@example.com
devUserName: Owner
agents:
  codex:
    name: Codex Local
    provider: CODEX
    transport: mcp_stdio
    command: codex
    args: ["mcp-server"]
    framing: jsonl
    capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    timeoutMs: 900000
    codex:
      approvalPolicy: never
      sandbox: workspace-write
```

Useful bridge commands:

```bash
pnpm bridge:login
pnpm bridge:agents
pnpm bridge:doctor -- --api-url http://127.0.0.1:3001
pnpm dev:bridge
pnpm bridge:smoke:package
```

`jean-bridge start` opens `/rooms/:roomId/bridge` with the room-agent token, receives delegated tasks, runs only locally declared commands, writes logs/artifacts through `/rooms/:roomId/mcp`, and supports task cancellation.

Remote MCP alpha can route Jean tasks to a configured HTTP MCP server without changing code:

```bash
WORKROOM_REMOTE_MCP_URL=https://remote-mcp.example/rpc
WORKROOM_REMOTE_MCP_TOKEN=optional-bearer-token
WORKROOM_REMOTE_MCP_TOOL_NAME=workroom.run_task
WORKROOM_REMOTE_MCP_TASK_TYPES=prototype,code,doc,research
```

The remote tool is called through JSON-RPC `tools/call` and should return an artifact patch in `structuredContent.patch` or a structured artifact object.

v0 API alpha can route code/prototype tasks directly to v0 when a v0 API key is configured:

```bash
V0_API_KEY=v0_...
V0_API_BASE_URL=https://api.v0.dev/v1
V0_MODEL=v0-1.5-md
V0_TASK_TYPES=prototype,code
V0_TIMEOUT_MS=120000
```

Jean calls `POST /v1/chats`, stores returned files/chat metadata in the artifact, and publishes a preview URL when v0 returns one.

Useful root scripts:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate
pnpm db:deploy
pnpm db:migrate
```

## Workspace Layout

- `apps/web`: Next.js App Router application
- `apps/api`: Fastify API skeleton
- `apps/room-worker`: LiveKit + Deepgram transcription worker
- `apps/agent-worker`: Node.js worker skeleton
- `apps/bridge-cli`: Node.js CLI skeleton
- `packages/shared`: shared Zod schemas and TypeScript types
- `packages/db`: Prisma package
- `packages/jean-core`: Jean orchestrator core package
- `packages/mcp`: MCP adapter package
- `packages/ui`: shared UI component package placeholder

`@jean/shared` is the shared type boundary. Internal apps and packages depend on it through `workspace:*`.
