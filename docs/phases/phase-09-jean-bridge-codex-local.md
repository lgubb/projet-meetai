# Phase 9 - jean-bridge, Codex local et cockpit agentique

Statut au 2026-06-18 : **Phase 9A a 9F6 posees pour le bridge local, Codex local, le cockpit agentique, les runs/fichiers persistants, les comments de run step, les previews sandboxees, les actions locales approuvees et le polish collaboration V1.**

## But de la phase

La phase 9 transforme le contrat agents de la Phase 8 en experience locale
utilisable : un participant peut connecter un agent qui tourne sur sa machine,
comme Codex local, sans exposer sa machine sur Internet et sans donner ses
credentials OpenAI a Jean.

Le principe produit est :

```text
Jean autorise une machine a travailler dans une room.
L'agent local garde son authentification et son execution chez l'utilisateur.
La room garde les tasks, logs, artifacts, approvals et events comme source de verite.
```

## Ce qui est pose

### Phase 9A-9D - Bridge local et dispatch agent

- CLI `jean-bridge` avec `login`, `start`, `agents list`.
- Config locale YAML et stockage local `state.json` en mode `0600`.
- WebSocket sortant vers l'API, heartbeat et reconnect.
- Registration d'agents locaux dans la room.
- Dispatch Jean -> bridge -> agent local.
- Cancellation d'une task in-flight.
- Adaptateurs locaux `mock` et `mcp_stdio`.
- Execution de `codex mcp-server` via stdio MCP JSONL.
- Le bridge n'execute pas une commande shell recue du cloud : il execute
  uniquement les commandes declarees localement.
- Les logs et artifacts reviennent par le Room MCP HTTP persiste.

### Phase 9E - Connexion produit Codex local

Objectif :

```text
Remplacer l'onboarding YAML par un flow UI "Connecter Codex local".
```

Decisions produit :

- le YAML reste acceptable pour dev/debug, pas comme experience V1 ;
- le pairing Jean et l'auth Codex sont deux sujets differents ;
- Jean ne stocke pas les credentials OpenAI/ChatGPT de l'utilisateur ;
- le code de pairing est temporaire, hash en DB, et ne donne qu'une session
  agent room-scoped ;
- si le code expire ou est perdu, l'utilisateur regenere un code depuis la room.

Flow :

```text
Room UI
  -> Connecter Codex local
  -> code temporaire
  -> jean-bridge pair
  -> verification codex local
  -> session agent limitee a la room
  -> Codex Local passe connected
```

Etats UI attendus :

```text
non connecte
pairing en attente
connecte
erreur Codex auth
erreur bridge
expire
```

## Decision UX ajoutee apres brainstorm

La room ne doit pas devenir un panneau d'agents anonyme. Chaque agent doit avoir
un proprietaire clair.

### Agents personnels

Attaches a une tuile user. Ils utilisent les credentials, la machine ou les
connecteurs de ce user.

Exemples :

```text
Codex local
Claude Code
agent Gmail
agent WhatsApp
agent Linear perso
agent open cloud personnel
```

### Agents de room

Attaches a Jean ou au room sandbox. Ils utilisent le contexte commun de la room
ou les droits de l'organisation.

Exemples :

```text
note taker Jean
recherche web
deck builder
diagram builder
synthese decisions
```

## Modele d'interface cible

```text
Users rail
  [Louis + badges agents] [Alice + badges agents] [Jean] [Bob + badges agents]

Room Stage
  artifact actif, preview partagee, terminal agent, doc, deck, diagramme

Timeline
  tasks, logs, approvals, decisions, erreurs, actions externes
```

Interactions :

- cliquer sur `Jean` ouvre le **Room Sandbox** ;
- cliquer sur une tuile user ouvre son **User Sandbox** ;
- cliquer sur un badge agent ouvre l'etat detaille de cet agent ;
- un user sandbox contient les agents, terminaux, brouillons et tasks privees
  ou semi-privees du user ;
- un resultat important peut etre promu vers le Room Stage commun.

## Jean action mode

Risque identifie : dans un call a 10+ personnes, un orchestrateur full-auto va
se tromper trop souvent si chaque phrase du transcript peut declencher une
action.

Decision V1 :

```text
Jean transcrit toujours.
Jean peut resumer et detecter des signaux.
Jean n'execute que s'il est explicitement appele.
```

Declencheurs explicites :

- clic sur le badge Jean ;
- mention vocale "Jean" ;
- commande ecrite ;
- bouton/action UI ;
- mention directe d'un agent, par exemple `@Codex`.

Etats :

```text
passif
ecoute active
propose action
execute
approval needed
blocked
```

Autonomie progressive :

```text
1. Manuel : l'utilisateur declenche.
2. Suggestion : Jean propose une action.
3. Preparation : Jean prepare un brouillon ou une task et attend validation.
4. Execution autonome : uniquement faible risque et habitudes tres claires.
```

## Vue terminal pour agents CLI-first

Pour Codex, Claude Code et d'autres agents de code, le terminal est une surface
naturelle. La V1 peut afficher une vue terminal dans le user sandbox, mais elle
ne doit pas exposer le Terminal natif en iframe.

Modele :

```text
Room web xterm.js
  -> WebSocket room/bridge
  -> jean-bridge local
  -> process agent autorise
```

Contraintes :

- pas de shell libre par defaut ;
- seulement les commandes declarees localement ;
- token Jean temporaire et room-scoped ;
- credentials agent gardes localement ;
- events structures obligatoires pour audit et replay ;
- approvals obligatoires pour R2/R3.

## Phase 9F - Cockpit agentique

Objectif :

```text
Construire le cockpit agentique de la room avant d'ajouter trop de connecteurs.
```

Livre :

- badges agents personnels sur les tuiles users ;
- compteur `+N` pour eviter la surcharge visuelle ;
- statut compact agent : `idle`, `working`, `approval needed`, `blocked` ;
- room sandbox ouvert depuis Jean ;
- user sandbox ouvert depuis une tuile participant ;
- action cards Jean : `Confirmer`, `Modifier`, `Annuler` ;
- timeline commune pour actions, decisions, logs et approvals ;
- promotion d'un output user sandbox vers le Room Stage ;
- placeholder terminal pour agent CLI-first ;
- metriques false positive / false negative / edit-cancel rate des propositions.
- persistence `AgentRun`, `AgentRunEvent`, `ArtifactFile`, `ArtifactFileVersion`, `ArtifactFileDiff` ;
- tools MCP `agent.start_run`, `agent.emit_event`, `agent.finish_run` ;
- endpoint `/rooms/:roomId/artifacts/:artifactId/files` ;
- rendu front des fichiers persistants avec fallback `content.files` ;
- download ZIP des fichiers d'artifact ;
- diff viewer branche sur les versions persistantes ;
- filtres tasks dans le cockpit ;
- comments persistants sur fichier/ligne/run step, branches sur les vrais `AgentRunEvent` ;
- preview iframe desktop/mobile, refresh et open in new tab ;
- retry/continue/cancel dans le cockpit Codex ;
- persistence `SandboxSession` et tools MCP HTTP `preview.create_session`, `preview.write_files`, `preview.start_server`, `preview.publish_url`, `preview.stop_session` ;
- audit `AGENT_TOOL_CALL_BLOCKED` quand le Policy Guard bloque une publication preview sans approval valide.
- cartes approval enrichies avec scope, payload, horodatage et decision.
- apply-to-local-repo via bridge local, avec approval humaine obligatoire et ecriture bornee au `cwd` du bridge.
- run checks via bridge local, avec approval humaine obligatoire et execution limitee aux checks declares localement dans `jean-bridge`.
- ownership multi-user signe dans les tokens agent, persiste sur `AgentRun` / `AgentRunEvent` et reutilise par le cockpit Codex.
- empty/error states du cockpit plus explicites, avec prochaine action quand Codex local ou le bridge est bloque.
- packaging tarball alpha : `@jean/shared` et `@jean/bridge-cli` ne sont plus `private`, limitent leurs fichiers publies, exposent le binaire `jean-bridge`, et `pnpm pack` prouve que le CLI depend de `@jean/shared@0.1.0` hors protocole workspace.
- smoke package hors monorepo : `pnpm bridge:smoke:package` installe les
  tarballs dans un projet temporaire hors workspace, verifie le binaire
  `jean-bridge`, l'import `@jean/shared`, l'absence de tests compiles publies
  et l'absence de dependance `workspace:*`. Le meme smoke lance aussi un
  `jean-bridge doctor`, un pairing et un `jean-bridge start` packagés contre
  un serveur Workroom mock, avec un faux binaire Codex MCP local, pour verifier
  preflight machine, WebSocket bridge, execution agent et publication d'artifact
  via Room MCP hors monorepo.

Reste a builder :

- publication registry, vraie URL API publique et smoke complet UI + bridge +
  vrai Codex authentifie sur une machine utilisateur hors monorepo.

Critere :

```text
Dans une room avec plusieurs participants, un utilisateur comprend immediatement
quels agents appartiennent a qui, peut ouvrir son sandbox ou celui de Jean,
declencher Jean explicitement, confirmer une action proposee, puis voir la task
et son resultat apparaitre dans la timeline et le stage commun.
```

## Hors scope maintenu

- Pas d'orchestration autonome globale sur tout le transcript.
- Pas d'iframe de l'app Codex officielle.
- Pas de shell libre expose au navigateur.
- Pas de marketplace publique d'agents.
- Pas d'execution R2/R3 sans validation humaine.

## Fichiers a lire

- `apps/bridge-cli/src/index.ts` : commandes `pair`, `login`, `start`.
- `apps/bridge-cli/src/config.ts` : config locale et fichiers mode `0600`.
- `apps/bridge-cli/src/bridge-client.ts` : WebSocket sortant et dispatch.
- `apps/bridge-cli/src/mcp-stdio.ts` : pont stdio MCP.
- `apps/api/src/routes/bridge.ts` : endpoint bridge WebSocket.
- `apps/api/src/routes/local-codex.ts` : pairing produit Codex local.
- `apps/api/src/local-agent-bridge.ts` : broker agents locaux.
- `apps/web/src/components/room-shell.tsx` : UI room, agents, approvals et Codex local.
- `workroom-v1-roadmap.md` : cadrage produit global.
