# Phase 7 - E2B prototype connector

## But de la phase

La phase 7A branche Jean sur E2B pour produire une preview de prototype isolée.

Le flux visé est :

```text
voix -> transcript final -> Jean intent prototype -> task PREVIEW -> E2B sandbox -> preview URL -> iframe
```

## Ce qui a ete fait

- Les commandes `preview` sont routees vers `prototype`.
- Les artifacts `PREVIEW` ont un renderer web dedie.
- Le runner Jean sait publier un step `artifact.preview_url`.
- Un connecteur `e2b` est disponible quand `E2B_API_KEY` est present.
- Le connecteur cree un sandbox E2B avec timeout, ecrit un fichier `index.html`, lance un serveur HTTP dans le sandbox, puis publie l'URL publique.
- Les tests utilisent un faux `SandboxProvider`, donc ils ne touchent pas E2B reel.

## Pourquoi c'est important

Avant cette phase, Jean pouvait produire du texte, du code mock et une recherche sourcee. Avec E2B, Jean commence a produire un resultat interactif visible dans la room.

Le connecteur ne lance jamais de commandes utilisateur sur la machine locale. Le HTML genere est ecrit dans E2B, et les seules commandes shell sont des commandes constantes executees dans le sandbox.

## Lancement local

Ajoute une cle E2B a l'environnement :

```bash
E2B_API_KEY=<cle API>
```

Puis lance la boucle locale :

```bash
pnpm dev:local
```

Depuis la Phase 8E, `pnpm dev:local` utilise un room-worker mock pour que le smoke local demarre sans secrets LiveKit/Deepgram. C'est suffisant pour verifier API/web/artifacts/previews. Pour declencher le flow par une vraie phrase dans LiveKit, lance `pnpm dev:room-worker` avec les variables LiveKit/Deepgram reelles.

Dire :

```text
Jean, cree une preview HTML de dashboard.
```

doit produire une task `PREVIEW`, des logs E2B, puis une URL `https://3000-....e2b.app` affichee dans l'onglet central quand le worker voix reel est actif.

## Fichiers a lire

- `apps/api/src/e2b-connector.ts` : connecteur E2B et provider sandbox.
- `apps/api/src/jean-task-runner.ts` : selection des connecteurs et publication de `artifact.preview_url`.
- `packages/jean-core/src/index.ts` : detection des intents `prototype`.
- `apps/web/src/components/room-shell.tsx` : renderer `PREVIEW` et iframe.
- `apps/api/src/routes.test.ts` : test d'integration avec faux provider E2B.
