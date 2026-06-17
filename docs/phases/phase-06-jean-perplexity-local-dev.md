# Phase 6 - Jean runner, Perplexity et stabilisation locale

## But de la phase

La phase 6 transforme Jean en orchestrateur utile pour une premiere capacite externe reelle : la recherche sourcée.

Apres une commande vocale, Jean doit creer une task, la faire vivre avec des logs, appeler le bon connecteur, patcher l'artifact, puis terminer la task. Pour les recherches, le connecteur prioritaire est Perplexity. Si Perplexity n'est pas disponible, Jean retombe sur le mock local sans casser le transcript.

## Ce qui a ete fait

- Runner local Jean cote API.
- Interface minimale `AgentConnector`.
- Connecteur mock local pour `DOCUMENT`, `RESEARCH`, `CODE` et fallback.
- Connecteur Perplexity pour les tasks `research`.
- Logs visibles : lancement recherche, reception synthese, fallback si erreur.
- Patch artifact `RESEARCH` avec `provider`, `model`, `summary`, `text` et `sources`.
- Renderer web research qui affiche le rapport et les sources.
- Override `WORKROOM_AUTH_MODE=dev` pour eviter que Clerk casse le dev local.
- `turbo.json` transmet les variables `PERPLEXITY_*` aux tasks Turbo.
- Scripts root pour lancer la boucle locale complete.

## Pourquoi c'est important

Avant cette phase, Jean savait creer un squelette de task. Maintenant il execute un vrai workflow observable :

```text
voix -> transcript final -> Jean intent -> task -> runner -> Perplexity -> artifact -> completed
```

Cette forme est celle que reprendront les prochains connecteurs. E2B, Codex et Lovable ne doivent pas ecrire directement dans l'UI : ils doivent produire des steps, logs et patches comme Perplexity.

## Lancement local recommande

Depuis un shell ou `direnv` a charge `.envrc` :

```bash
pnpm dev:local
```

Ce script lance :

- `@jean/api`
- `@jean/web`
- `@jean/room-worker`

Il force aussi `WORKROOM_AUTH_MODE=dev`. C'est volontaire : en local, on veut garder les headers dev de l'UI meme si les variables Clerk existent dans `.envrc`.

Depuis la Phase 8E, `pnpm dev:local` lance le room-worker en `WORKROOM_ROOM_WORKER_MODE=mock`. Ce mode sert au smoke API/web/MCP sans secrets LiveKit/Deepgram. Pour tester la vraie boucle voix -> Deepgram -> Jean, lance un vrai worker avec `pnpm dev:room-worker` et les variables LiveKit/Deepgram reelles.

Si tu veux separer les logs :

```bash
pnpm dev:api:local
pnpm dev:web
pnpm dev:room-worker
```

Variables importantes :

```text
WORKROOM_AUTH_MODE=dev
WORKROOM_API_URL=http://127.0.0.1:3001
NEXT_PUBLIC_WORKROOM_WS_URL=ws://127.0.0.1:3001
PERPLEXITY_API_KEY=<cle API>
PERPLEXITY_MODEL=sonar-pro
```

Variables supplementaires pour la vraie boucle voix :

```text
WORKROOM_ROOM_ID=<room ouverte dans le navigateur>
LIVEKIT_URL=<url LiveKit>
LIVEKIT_API_KEY=<cle LiveKit>
LIVEKIT_API_SECRET=<secret LiveKit>
DEEPGRAM_API_KEY=<cle Deepgram>
WORKROOM_WORKER_TOKEN=<token worker>
```

## Critere de reussite

Dire :

```text
Jean, fais une recherche sur LiveKit.
```

doit produire :

- une task `RESEARCH` ;
- des logs visibles ;
- un appel Perplexity si la cle API est presente ;
- un artifact avec synthese et sources ;
- une task finale `COMPLETED`.

Le signe que Perplexity est vraiment utilise :

```text
Recherche Perplexity en cours.
Synthese Perplexity recue.
```

Si l'UI affiche `Synthese locale provisoire`, Jean est retombe sur le mock local.

En `pnpm dev:local` mock, ce critere se verifie surtout via les routes/API et les tests. Pour le verifier par la voix dans la room, il faut le worker reel decrit plus haut.

## Fichiers a lire

- `apps/api/src/jean-flow.ts` : declenchement Jean apres transcript final.
- `apps/api/src/jean-task-runner.ts` : runner, connecteurs et fallback.
- `apps/api/src/perplexity-connector.ts` : appel Perplexity et validation de reponse.
- `apps/api/src/auth.ts` : selection `dev` ou `clerk`.
- `turbo.json` : variables transmises aux tasks.
- `apps/web/src/components/room-shell.tsx` : renderer research et logs.
- `apps/api/src/routes.test.ts` : tests du workflow Jean + Perplexity.

## Suite realisee

La phase suivante, **Phase 7A - E2B prototype connector**, est maintenant documentee dans `phase-07-e2b-prototype-connector.md`.

Objectif :

```text
Jean, cree une preview HTML de X.
```

doit creer une task prototype/code, lancer un sandbox E2B, streamer les logs, produire une URL de preview, puis afficher cette preview dans l'onglet central.
