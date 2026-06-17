# Phase 8 - Room MCP et contrat agents

Statut au 2026-06-17 : **Phase 8A a 8E livree pour le contrat produit**.

Le resultat concret est :

```text
Un agent MCP externe, avec un token de room, peut travailler dans une room reelle sans parler au frontend.
```

## But de la phase

La phase 8 transforme la room en surface agentique standardisee. Le produit ne cherche pas a devenir un clone de v0, Lovable, Claude Code ou Codex : la room reste la source de verite, et les agents externes manipulent son contexte, ses tasks, ses artifacts, ses previews, ses approvals et ses events via un contrat MCP/API.

Le socle livre ici est volontairement provider-agnostic :

- la room garde le transcript, les participants, tasks, artifacts, previews, approvals et events ;
- les agents ne parlent pas directement au frontend ;
- les agents passent par MCP/API ;
- E2B est un provider sandbox interchangeable, pas l'agent qui code ;
- les actions sensibles creent des approval requests ;
- les evenements importants sont auditables ;
- Codex, Claude Code, Lovable, v0, un agent custom ou un MCP distant doivent pouvoir utiliser le meme contrat.

## Sources consultees

- MCP specification 2025-06-18 : `https://modelcontextprotocol.io/specification/2025-06-18`
- MCP tools/resources/prompts : `https://modelcontextprotocol.io/specification/2025-06-18/server/tools`, `.../server/resources`, `.../server/prompts`
- MCP transports/auth/roots/elicitation : `.../basic/transports`, `.../basic/authorization`, `.../client/roots`, `.../client/elicitation`
- Codex manual officiel recupere le 2026-06-16 : `https://developers.openai.com/codex/codex-manual.md`
- E2B docs : `https://e2b.dev/docs`, `https://e2b.dev/docs/filesystem/read-write`, `https://e2b.dev/docs/commands`, `https://e2b.dev/docs/network/public-url`
- Claude Code docs : `https://code.claude.com/docs/en/overview`, `https://code.claude.com/docs/en/mcp`, `https://code.claude.com/docs/en/permissions`
- v0 docs : `https://v0.app/docs`, `https://v0.app/docs/MCP`, `https://v0.app/docs/sandbox`, `https://v0.app/docs/api`
- Lovable docs : `https://docs.lovable.dev/introduction/welcome`, `https://docs.lovable.dev/integrations/lovable-mcp-server`

## Contrat Room <-> Agents

Interfaces verrouillees dans `packages/shared/src/domain.ts` :

- `RoomAgent`
- `AgentRun`
- `RealtimeTask`
- `RealtimeArtifact`
- `RoomEvent`
- `ApprovalRequest`
- `SandboxSession`
- `RoomTranscriptSegment`
- `RoomParticipantSummary`

Le contrat favorise des payloads stricts cote enveloppe, et des `metadata` libres pour garder une marge sans multiplier les migrations au debut. Les secrets ne doivent jamais etre retournes dans les resources ou tool results ; le serveur MCP retire les cles de type `token`, `secret`, `password`, `apiKey` et `authorization`.

## Catalogue MCP officiel

Le package `@jean/mcp` expose un serveur in-process testable avec les methodes MCP essentielles :

- `initialize`
- `tools/list`
- `tools/call`
- `resources/list`
- `resources/templates/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

### Tools contexte

```text
room.get_context_pack
room.get_room_state
room.get_transcript
room.search_transcript
room.list_participants
room.list_tasks
room.get_task
room.list_artifacts
room.read_artifact
room.list_events
room.get_capabilities
```

### Tools tasks et artifacts

```text
room.create_task
room.update_task_status
room.assign_task
room.append_log
room.create_artifact
room.write_artifact
room.patch_artifact
room.set_preview_url
room.complete_task
room.fail_task
```

### Tools preview et sandbox

```text
preview.create_session
preview.write_files
preview.start_server
preview.publish_url
preview.stop_session
```

### Tools agents

```text
agent.register
agent.heartbeat
agent.list
agent.claim_task
agent.start_run
agent.emit_event
agent.finish_run
```

### Tools humains et controle

```text
approval.request
approval.get_status
room.request_user_input
room.speak
```

### Resources

```text
room://{roomId}/context
room://{roomId}/transcript
room://{roomId}/tasks
room://{roomId}/tasks/{taskId}
room://{roomId}/artifacts
room://{roomId}/artifacts/{artifactId}
room://{roomId}/events
room://{roomId}/agents
room://{roomId}/approvals
```

### Prompts

```text
workroom.plan_task
workroom.research_brief
workroom.code_preview
workroom.deck_outline
workroom.review_artifact
workroom.request_approval
```

## Transport, auth et API

Transport cible long terme :

- Streamable HTTP cote API pour agents distants.
- Stdio ou in-process seulement pour tests, dev local et agents simples.

Auth cible :

- token obligatoire par room/session/agent ;
- bearer/OAuth pour MCP HTTP distant ;
- aucun secret dans les resources MCP, les prompts ou les logs ;
- approvals obligatoires pour actions destructives, publication externe, ecriture hors sandbox, acces donnees sensibles, push/deploy.

La phase actuelle livre deux surfaces :

- le serveur in-process `@jean/mcp`, garde comme banc de test du catalogue complet et du provider sandbox mock injectable ;
- le transport HTTP Fastify room-scoped, branche sur l'etat reel API/DB et protege par un token signe `roomId + agentId + sessionId`.

Le transport HTTP expose les methodes JSON-RPC MCP essentielles sur `POST /rooms/:roomId/mcp`. Les agents distants obtiennent d'abord une session via `POST /rooms/:roomId/agent-sessions`, puis appellent le MCP HTTP avec `Authorization: Bearer <room-agent-token>`.

Important : le jalon livre un POST JSON-RPC HTTP room-scoped. Il ne livre pas encore un transport SSE long-running pour responses streamables. C'est garde hors scope tant que le contrat HTTP/auth/persistence n'est pas prouve.

### Endpoints ajoutes

```text
POST /rooms/:roomId/agent-sessions
POST /rooms/:roomId/mcp
GET  /rooms/:roomId/agents
GET  /rooms/:roomId/approvals
POST /rooms/:roomId/approvals/:approvalId/decision
```

### Regles d'auth appliquees

- Le token agent est signe et contient `roomId`, `agentId`, `sessionId`, `issuedAt`, `expiresAt`.
- Chaque appel MCP reverifie que le token correspond a la room de l'URL.
- Chaque appel MCP reverifie que la session `AgentConnection` existe encore.
- Chaque appel MCP reverifie que l'agent est bien participant de la room.
- Un agent ne peut pas passer un autre `agentId` dans les tool arguments.
- Une approval deja decidee ne peut pas etre resolue une seconde fois.

## Ce qui a ete fait

### Phase 8A - Spec et contrat

- Ajout des schemas Phase 8 dans `@jean/shared`.
- Contrats `RoomAgent`, `AgentRun`, `ApprovalRequest`, `SandboxSession`, `RoomEvent`, `ContextPack`.
- Typage des events `room.event` pour publier les audit logs dans la room.
- Documentation dediee dans ce fichier.

### Phase 8B - Serveur MCP in-process

- Remplacement du package `@jean/mcp` vide par un serveur Room MCP in-process.
- Catalogue complet tools/resources/prompts.
- Validation JSON Schema des tool arguments.
- Etat memoire de room pour tests et client mock.
- Provider sandbox mock injectable.
- Events auditables pour register/heartbeat/runs/tasks/logs/artifacts/sandbox/approvals.
- Sanitization des secrets dans les outputs.
- Client MCP mock pour lire le contexte et piloter un flow agent.

### Phase 8C - MCP HTTP reel

- Transport MCP HTTP Fastify sur `POST /rooms/:roomId/mcp`.
- Creation de sessions agents via `POST /rooms/:roomId/agent-sessions`.
- Bridge MCP HTTP vers l'etat reel DB/API.
- Tools HTTP branches sur :
  - tasks ;
  - artifacts ;
  - task logs ;
  - preview URLs ;
  - transcript ;
  - participants ;
  - agents ;
  - approvals ;
  - task events ;
  - audit logs.

### Phase 8D - Auth, permissions et approvals

- Auth agent stricte : token signe `roomId + agentId + sessionId`.
- Verification de la session `AgentConnection` a chaque appel.
- Verification de la participation agent dans la room a chaque appel.
- Protection anti-usurpation d'`agentId`.
- Endpoints d'approvals :
  - `GET /rooms/:roomId/approvals` ;
  - `POST /rooms/:roomId/approvals/:approvalId/decision`.
- Blocage d'une deuxieme decision sur une approval deja resolue.

### Phase 8E - UI minimale Agents / Approvals

- UI `Agents` dans la room.
- UI `Approvals` dans la room.
- Boutons `Approve` / `Reject`.
- Alimentation initiale par API.
- Mise a jour par events realtime `room.event`.
- Replay des events persistants task/artifact/audit pour que la room ouverte apres coup montre quand meme l'historique.

### Dev local et smoke

- `pnpm dev:local` lance API + web + room-worker.
- Le room-worker peut tourner en `WORKROOM_ROOM_WORKER_MODE=mock` pour ne pas bloquer sur LiveKit/Deepgram en local.
- Le smoke local a ete verifie avec un client HTTP externe qui ne passe pas par l'in-process MCP.
- Le smoke browser a verifie que la room affiche :
  - task creee par agent MCP ;
  - log agent ;
  - artifact ;
  - preview ;
  - agent ;
  - approval pending ;
  - events task/artifact/audit.

## Critere de reussite actuel

Les tests `@jean/mcp` prouvent que :

- le serveur expose tools, resources et prompts ;
- un client mock lit le contexte de room ;
- un agent mock se register ;
- il cree et claim une task ;
- il ecrit des logs ;
- il produit un artifact ;
- il publie une preview via provider sandbox mock ;
- il demande une approval ;
- les actions apparaissent dans les events de room ;
- les schemas rejettent les payloads invalides ;
- les secrets ne sont pas exposes.

Les regressions Jean/Perplexity/E2B passent dans la suite API relancee apres le branchement MCP HTTP.

Les tests API prouvent aussi qu'un client MCP externe HTTP, avec token de room, peut :

- lire `room.get_context_pack` ;
- creer et claim une task ;
- ecrire un log ;
- produire un artifact ;
- publier une preview URL ;
- demander une approval ;
- voir les actions dans les events de room ;
- etre bloque s'il tente d'usurper un autre `agentId` ou si sa session n'existe plus ;
- voir les audit events `AGENT_REGISTERED` et `APPROVAL_REQUESTED` dans le replay UI.

Le smoke browser local a aussi montre que les panneaux UI affichent bien l'etat persistant :

- `Agents` contient l'agent MCP externe ;
- `Approvals` contient l'approval pending ;
- `Events` contient `Agent Registered`, `Task Created`, `Task Log`, `Artifact Preview`, `Approval Requested`.

Le message LiveKit `could not establish signal connection` reste attendu en `pnpm dev:local` quand aucun vrai serveur LiveKit n'est lance : ce smoke vise le contrat MCP/API/UI, pas la media room.

## Hors scope maintenu

- Pas de `jean-bridge`.
- Pas de connexion reelle a Codex local, Claude Code, Lovable ou v0.
- Pas de marketplace d'agents.
- Pas encore de transport SSE long-running pour responses MCP streamables ; le jalon actuel couvre le POST JSON-RPC HTTP room-scoped.
- Pas encore de persistance dediee pour `AgentRun` et `SandboxSession` ; le jalon actuel utilise les tables existantes `Agent`, `AgentConnection`, `Task`, `Artifact`, `Approval`, `TaskEvent` et `AuditLog`.

## Prochaine phase logique

La prochaine phase n'est pas de brancher tous les agents a la fois. Le contrat HTTP/auth/persistence est maintenant prouve, donc l'ordre sain reste :

```text
Phase 9  - jean-bridge + Codex local
Phase 10 - Lovable/v0/Claude connectors
Phase 11 - policy guard complet, permissions fines et audit durci
```

## Fichiers a lire

- `packages/shared/src/domain.ts` : contrats agents/runs/approvals/sandbox.
- `packages/mcp/src/index.ts` : serveur Room MCP in-process.
- `packages/mcp/src/index.test.ts` : client mock et criteres d'acceptation.
- `apps/api/src/routes/room-mcp.ts` : endpoints HTTP MCP, sessions agents et approvals.
- `apps/api/src/room-mcp-service.ts` : bridge MCP HTTP vers l'etat reel DB/API.
- `apps/api/src/room-agent-auth.ts` : token agent room/session.
- `apps/api/src/room-task-service.ts` : tasks, artifacts, logs, preview URLs et replay events persistants.
- `apps/web/src/components/room-shell.tsx` : UI minimale Agents / Approvals.
- `apps/web/src/lib/use-room-events.ts` : WebSocket + replay des events room.
- `docs/phases/phase-08-room-mcp-agents-contract.md` : cette spec.
