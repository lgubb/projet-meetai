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

For Prisma migrations, provide `DATABASE_URL` before running `pnpm db:migrate`. See `.env.example` for the expected variable name.

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
WORKROOM_WORKER_TOKEN
```

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

Useful root scripts:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:generate
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
