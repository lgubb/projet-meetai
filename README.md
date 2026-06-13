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

For Prisma migrations, provide `DATABASE_URL` before running `pnpm db:migrate`. See `.env.example` for the expected variable name.

The API uses Clerk when `CLERK_SECRET_KEY` is set. Without Clerk env vars, local API requests can use explicit dev auth headers:

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
pnpm -F @jean/room-worker dev
```

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
