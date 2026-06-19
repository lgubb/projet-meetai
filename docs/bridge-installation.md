# jean-bridge alpha installation

This guide documents the alpha path for connecting a local machine to one Workroom room.

## Prerequisites

- Node.js `>=22.12.0`
- `pnpm`
- local Workroom API reachable from the machine running the bridge
- Codex CLI installed and authenticated when pairing Codex Local

For Codex Local, verify the local CLI first:

```bash
codex --version
codex doctor --json
```

If auth fails, run `codex login` or `codex login --device-auth` before pairing.

You can also run the bridge preflight before pairing:

```bash
jean-bridge doctor --api-url https://your-workroom-api.example
```

In the monorepo alpha, the same check is available as:

```bash
pnpm bridge:doctor -- --api-url http://127.0.0.1:3001
```

Use `--skip-codex` when validating a non-Codex local agent, and `--skip-api`
for a local-only preflight.

## Recommended flow: pair from the room

1. Start Workroom locally or use the deployed API URL.

```bash
pnpm dev:local
```

2. Open a room in the web app.
3. In the room Agents panel, use `Connecter Codex local`.
4. Run the generated command on the machine that should execute Codex.

In the monorepo alpha, the command shape is:

```bash
pnpm --filter @jean/bridge-cli dev -- pair --api-url http://127.0.0.1:3001 --code <pairing-code>
```

For an installed package, the command shape is:

```bash
jean-bridge pair --api-url https://your-workroom-api.example --code <pairing-code>
```

By default, `pair` verifies Codex locally, consumes the temporary pairing code,
writes `~/.jean-bridge/config.yaml`, writes the room-scoped session into
`~/.jean-bridge/state.json`, then starts the bridge.

Use `--no-start` if you only want to pair now and start later:

```bash
pnpm --filter @jean/bridge-cli dev -- pair --api-url http://127.0.0.1:3001 --code <pairing-code> --no-start
pnpm dev:bridge
```

## Useful commands

```bash
jean-bridge agents list
jean-bridge doctor --api-url https://your-workroom-api.example
jean-bridge login
jean-bridge start
pnpm bridge:agents
pnpm bridge:doctor -- --api-url http://127.0.0.1:3001
pnpm bridge:login
pnpm dev:bridge
```

- `agents list` / `bridge:agents` shows configured agents and session status.
- `doctor` / `bridge:doctor` checks local runtime, Codex auth, and Workroom API health before pairing.
- `login` / `bridge:login` creates room-scoped sessions for configured agents.
- `start` / `dev:bridge` starts the outbound bridge WebSocket.

## Package smoke

The alpha packages are packable before registry publication:

```bash
pnpm bridge:smoke:package
```

The smoke builds and packs `@jean/shared` and `@jean/bridge-cli`, installs both
tarballs into a temporary consumer project outside the monorepo, verifies the
installed `jean-bridge` binary, checks that compiled tests are excluded, and
checks that the tarball depends on the versioned `@jean/shared` package instead
of a `workspace:*` dependency. It also runs packaged `jean-bridge doctor`,
`jean-bridge pair --no-start`, and `jean-bridge start` against a local mock
Workroom API/WebSocket server with a fake Codex MCP binary, proving that the
installed CLI can preflight the machine, pair, open the outbound bridge socket,
execute a Codex-style local agent, and publish an artifact through Room MCP
outside the monorepo.

## Manual config fallback

Pairing from the room is preferred. For local debugging, a minimal
`~/.jean-bridge/config.yaml` can be written manually:

```yaml
apiUrl: "http://127.0.0.1:3001"
wsUrl: "ws://127.0.0.1:3001"
roomId: "<room-id>"
devUserEmail: "owner@example.com"
devUserName: "Owner"
agents:
  codex:
    name: "Codex Local"
    provider: "CODEX"
    transport: "mcp_stdio"
    command: "codex"
    args: ["mcp-server"]
    framing: "jsonl"
    cwd: "/absolute/path/to/repo"
    checks:
      test:
        command: "pnpm"
        args: ["test"]
        cwd: "/absolute/path/to/repo"
        timeoutMs: 600000
```

Then run:

```bash
pnpm bridge:login
pnpm dev:bridge
```

## Security model

- The bridge opens an outbound WebSocket to Workroom; Workroom does not open a shell on the user's machine.
- Session tokens are room-scoped and stored in `~/.jean-bridge/state.json` with file mode `0600`.
- Local actions are limited to commands declared in `~/.jean-bridge/config.yaml`.
- Applying artifact files to a local repo and running local checks require human approval from the room.
- Codex credentials stay local. Workroom stores the room pairing and agent session, not the user's Codex auth.

## Troubleshooting

- `Codex CLI is not installed or not available in PATH.`: install Codex CLI or fix `PATH`.
- `Codex local auth check failed.`: run `codex login`.
- Pairing expires or is consumed: generate a new code from the room.
- Bridge connected but no work arrives: check `pnpm bridge:agents`, then verify the room still shows the agent connected.
- Local checks do not appear: add them under `agents.<agent>.checks` in `config.yaml`.
