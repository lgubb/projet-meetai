# Phase 1 - Auth, organisations et room CRUD

## But de la phase

La phase 1 rend l'application navigable : un utilisateur peut avoir une identite, creer une organisation, creer une room, rejoindre une room par lien, et etre enregistre comme participant.

C'est la premiere couche produit : avant de parler d'audio, d'IA ou de documents, il faut savoir qui est dans quel espace de travail.

## Ce qui a ete fait

- API Fastify pour lister/creer des organisations.
- API Fastify pour lister, creer, lire, renommer, supprimer et rejoindre des rooms.
- Verification d'appartenance a une organisation avant d'acceder a ses rooms.
- Creation automatique du participant `HOST` quand un utilisateur cree une room.
- Route `/rooms/:roomId/join` qui permet a un utilisateur rejoignant par lien de devenir membre de l'organisation et participant de la room.
- Front Next.js avec un dashboard de rooms.
- Mode dev sans Clerk : l'identite locale passe par les headers `x-dev-user-email` et `x-dev-user-name`.
- Preparation Clerk cote API : si `CLERK_SECRET_KEY` existe, l'API utilise Clerk.

## Pourquoi c'est important

Cette phase donne un cadre de securite et de collaboration.

Une room n'est pas juste une URL publique : elle appartient a une organisation, et l'API verifie que l'utilisateur a le droit d'y acceder. Le lien de room sert donc a rejoindre le bon espace, puis l'utilisateur est inscrit en base.

Le mode dev avec headers est volontairement simple. Il permet de coder et tester vite sans bloquer tout le projet sur l'interface de login Clerk. La vraie authentification reste prevue via Clerk.

## Outils utilises

- Fastify : serveur API rapide et simple a tester avec `server.inject`.
- Clerk : fournisseur d'authentification cible pour la production.
- Next.js App Router : interface web, avec une page dashboard et une page room.
- Zod : validation stricte des params et bodies API.
- Prisma : persistance users, organisations, memberships, rooms et participants.

## Maniere de coder

Le code suit une idee simple : toutes les routes partent de l'utilisateur courant.

1. `upsertCurrentUser` recupere l'identite depuis Clerk ou les headers dev.
2. L'API cree ou met a jour le user en base.
3. Les routes verifient ensuite l'appartenance a l'organisation ou a la room.

Ce choix evite de passer des IDs utilisateur arbitraires depuis le front. Le front dit "voici mon identite", puis le backend decide ce que cette identite a le droit de faire.

## Flux utilisateur

1. Sur le dashboard, l'utilisateur choisit son identifiant dev.
2. Il cree une organisation.
3. Il cree une room dans cette organisation.
4. Il est redirige vers `/rooms/:roomId`.
5. Une autre personne peut ouvrir le meme lien et appeler `/join`.

## Fichiers a lire

- `apps/api/src/auth.ts` : lecture Clerk ou headers dev.
- `apps/api/src/routes/organizations.ts` : routes organisations.
- `apps/api/src/routes/rooms.ts` : routes rooms, join et participants.
- `apps/web/src/components/workroom-dashboard.tsx` : dashboard de creation organisation/room.
- `apps/web/src/lib/dev-user.ts` : identite locale en dev.
- `apps/web/src/lib/workroom-api.ts` : client API cote front.
- `apps/api/src/routes.test.ts` : test du flux minimal phase 1.

## Limite actuelle

La partie Clerk est branchee cote API, mais l'interface web utilise encore l'identite dev locale. C'est pratique pour construire vite, mais ce n'est pas encore une experience d'auth production complete.
