# Phase 0 - Cadrage et contrats techniques

## But de la phase

La phase 0 sert a poser les rails avant de construire les fonctionnalites visibles. L'objectif n'etait pas encore d'avoir une room utilisable, mais de figer les contrats communs : structure du monorepo, modele de donnees, types partages, conventions de build/test.

Autrement dit : avant de brancher l'IA, l'audio ou le temps reel, on a defini les mots du systeme.

## Ce qui a ete fait

- Creation d'un monorepo pnpm/Turborepo avec plusieurs apps et packages.
- Mise en place de `@jean/shared`, qui contient les schemas Zod et les types TypeScript communs.
- Mise en place de `@jean/db`, qui centralise Prisma et le client Postgres.
- Creation du schema Prisma initial : users, organisations, rooms, participants, agents, tasks, artifacts, approvals, transcripts, audit logs.
- Ajout de packages/applications squelettes pour anticiper les prochaines phases : `agent-worker`, `bridge-cli`, `mcp`, `ui`.
- Ajout des scripts racine : build, typecheck, lint, test, migrations Prisma.

## Pourquoi c'est important

Sans cette phase, chaque partie de l'app pourrait inventer ses propres noms et formats. Par exemple, le front pourrait parler de `task.updated` pendant que l'API attend `task.status`, ou un artifact pourrait etre envoye avec un type non reconnu.

Les contrats partages evitent ce glissement. `@jean/shared` joue le role de dictionnaire commun entre le front, l'API, les workers et les futurs connecteurs.

Le schema Prisma pose aussi une vision produit : Workroom n'est pas juste un chat. C'est une room avec des participants, des agents, des taches, des artifacts versionnes, des approvals et des logs d'audit. Meme si tout n'est pas encore exploite, le modele prepare l'application a devenir un environnement de travail avec IA.

## Outils utilises

- pnpm workspaces : permet d'avoir plusieurs apps/packages dans un seul repo, avec des dependances locales comme `@jean/shared`.
- Turborepo : orchestre les commandes `build`, `test`, `typecheck` sur tout le monorepo.
- Prisma : decrit la base Postgres dans un schema lisible, puis genere un client TypeScript.
- Zod : valide les donnees au runtime. TypeScript aide pendant le codage, Zod verifie les payloads reels qui arrivent dans l'app.

## Maniere de coder

La phase a privilegie les frontieres claires :

- le package shared ne contient pas de logique metier lourde, seulement des schemas et des types ;
- la base de donnees est encapsulee dans `@jean/db` ;
- les apps consomment les packages via `workspace:*`, ce qui evite les copies de types ;
- les enums Prisma et Zod utilisent les memes concepts pour reduire les divergences.

## Fichiers a lire

- `package.json` : scripts racine et version pnpm.
- `pnpm-workspace.yaml` : declaration des apps/packages du monorepo.
- `turbo.json` : orchestration des taches.
- `packages/shared/src/domain.ts` : contrats TypeScript/Zod de domaine et d'events.
- `packages/db/prisma/schema.prisma` : modele de donnees.
- `packages/db/src/index.ts` : creation du client Prisma.
- `README.md` : commandes de dev et variables d'environnement.

## Critere de reussite de la roadmap

La roadmap demandait que `pnpm typecheck`, `pnpm test` et Prisma migrate fonctionnent. Le repo contient les scripts et les tests de contrats qui permettent de verifier cette base.
