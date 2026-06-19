# Phase 10 - Lovable, v0 et Claude Code

Statut au 2026-06-19 : **Phase 10A bridge-first livree, Phase 10B Remote MCP alpha posee, Phase 10C v0 API alpha posee.**

## But de la phase

La Phase 10 ajoute les agents de build/prototype externes apres avoir stabilise
le cockpit, le bridge local et le contrat Room MCP.

Le principe V1 reste :

```text
La room garde la source de verite.
L'agent externe garde ses credentials et son execution.
Jean route la task vers un agent disponible et audite le resultat dans la room.
```

## Decision Phase 10A

Lovable, v0 et Claude Code ne sont pas le meme type d'integration :

- Lovable expose un serveur MCP HTTP, mais son OAuth est porte par des clients
  supportes comme ChatGPT, Claude/Claude Code, Cursor et VS Code.
- v0 dispose d'un SDK/API et de workflows MCP, mais cela implique une cle API
  et un connecteur cloud separe.
- Claude Code est d'abord un agent local capable de parler MCP.

Le premier incrément propre est donc bridge-first :

```text
jean-bridge local
  -> agent LOVABLE / V0 / CLAUDE_CODE deja authentifie localement
  -> Room MCP HTTP
  -> tasks, logs, artifacts, previews, approvals
```

## Ce qui est pose

- Prisma `AgentProvider` accepte `CLAUDE_CODE`, `V0` et `CUSTOM`.
- L'API `/agent-sessions` accepte les providers du contrat partage.
- `jean-bridge` accepte les providers `CLAUDE_CODE`, `LOVABLE`, `V0`,
  `CUSTOM`, avec defaults de nom et capacites adaptes.
- Jean route les tasks `prototype` vers un agent bridge disponible dans cet
  ordre : `LOVABLE`, `V0`, `CODEX`, `CLAUDE_CODE`, `MCP`, `CUSTOM`.
- Jean route les tasks `code` vers un agent bridge disponible dans cet ordre :
  `CODEX`, `CLAUDE_CODE`, `V0`, `LOVABLE`, `MCP`, `CUSTOM`.
- Le broker bridge filtre les dispatchs par providers autorises, en plus des
  capacites.
- Un test API prouve qu'une demande de preview est routee vers un agent
  Lovable connecte via bridge, que l'artifact revient dans la room, et que la
  task termine.
- Un connecteur Remote MCP generique est disponible cote Jean quand
  `WORKROOM_REMOTE_MCP_URL` est configure. Il appelle un tool MCP distant
  configurable (`WORKROOM_REMOTE_MCP_TOOL_NAME`, defaut `workroom.run_task`) via
  JSON-RPC `tools/call`, transmet le contexte room/task/artifact, puis applique
  le `structuredContent.patch` retourne comme patch d'artifact. Un bearer token
  optionnel peut etre fourni avec `WORKROOM_REMOTE_MCP_TOKEN`.
- Le Remote MCP alpha est limite par `WORKROOM_REMOTE_MCP_TASK_TYPES`
  (`prototype,code,doc,research` par defaut) et `WORKROOM_REMOTE_MCP_TIMEOUT_MS`.
- Test unitaire prouve : le connecteur est desactive sans URL, filtre les task
  types, envoie le bearer token, appelle le tool configure et publie patch +
  preview URL.
- Un connecteur v0 API direct est disponible quand `V0_API_KEY` est configure.
  Il route les tasks `prototype` et `code` vers `POST /v1/chats`, avec
  `V0_API_BASE_URL`, `V0_MODEL`, `V0_TASK_TYPES` et `V0_TIMEOUT_MS`.
- Le connecteur v0 applique les fichiers, l'URL de chat et l'URL de preview
  retournes comme patch d'artifact, puis publie `artifact.preview_url` si v0
  retourne une preview.
- Test unitaire prouve : le connecteur v0 est desactive sans cle, filtre les
  task types, envoie le bearer token, appelle le modele configure et publie
  patch + preview URL.

## Reste hors Phase 10A/10B/10C alpha

- OAuth Lovable gere directement par Workroom.
- Distribution d'un plugin Claude Code ou installation automatique.
- Publication preview externe sans les approvals/policies deja en place.
- Decouverte dynamique de tools MCP distants, negotiation Streamable HTTP
  complete et gestion OAuth UI/provider par organisation.

Ces sujets doivent etre faits comme connecteurs dedies, pas melanges au socle
bridge local ou au socle Remote MCP generique.

## Fichiers a lire

- `packages/db/prisma/schema.prisma` : enum `AgentProvider`.
- `apps/bridge-cli/src/config.ts` : config locale des agents Phase 10.
- `apps/api/src/jean-task-runner.ts` : preference de routage bridge.
- `apps/api/src/remote-mcp-connector.ts` : connecteur Remote MCP alpha env-gated.
- `apps/api/src/v0-connector.ts` : connecteur v0 API alpha env-gated.
- `apps/api/src/local-agent-bridge.ts` : filtrage par provider/capacite.
- `apps/api/src/routes.test.ts` : test Lovable bridge end-to-end.
- `apps/api/src/remote-mcp-connector.test.ts` : tests du connecteur Remote MCP.
- `apps/api/src/v0-connector.test.ts` : tests du connecteur v0 API.
