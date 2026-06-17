# Phase 5 - Tasks, artifacts et WebSocket events

## But de la phase

La phase 5 transforme la room en workspace vivant. Une action de Jean ou d'un utilisateur ne doit pas seulement creer une ligne en base : elle doit produire des logs, faire evoluer un artifact, et mettre a jour l'interface en direct.

C'est la phase qui rend le travail visible.

## Ce qui a ete fait

- Modele `Task` avec statuts : `PENDING`, `RUNNING`, `WAITING_FOR_APPROVAL`, `COMPLETED`, `FAILED`, `CANCELED`.
- Modele `Artifact` avec types : document, code, research, diagram, preview, log.
- Modele `ArtifactVersion` pour garder les contenus versionnes.
- Modele `TaskEvent` pour enregistrer les evenements importants d'une task.
- API de creation/listing de tasks.
- API de changement de statut de task.
- API d'ajout de logs.
- API de mise a jour, patch et preview URL d'artifacts.
- `RoomEventBus` en memoire pour diffuser les events WebSocket aux clients connectes.
- Endpoint WebSocket `/rooms/:roomId/events`.
- Endpoint de replay `/rooms/:roomId/events/replay`.
- Hook front `useRoomEvents` avec reconnexion, deduplication et replay des events manques.
- Onglets dynamiques dans la room pour afficher les tasks/artifacts.
- Renderers simples pour artifacts `DOCUMENT`, `RESEARCH` et `CODE`.

## Pourquoi c'est important

Une task represente le travail a faire. Un artifact represente le resultat produit. Les logs racontent ce qui s'est passe entre les deux.

Cette separation est importante :

- la task dit "quel est le travail et ou en est-il ?" ;
- l'artifact dit "qu'est-ce qui a ete produit ?" ;
- les versions d'artifact disent "comment le resultat a evolue ?" ;
- les events disent "comment le front doit se mettre a jour en live ?".

Le replay est aussi un choix structurant. Si le navigateur perd temporairement le WebSocket, il peut demander les events persistants manques au lieu de rester avec un etat incomplet.

## Outils utilises

- Fastify WebSocket : connexion live entre API et front.
- Prisma : persistance tasks, artifacts, versions et task events.
- Zod : validation des payloads d'events temps reel.
- React state/hooks : fusion entre l'etat charge au demarrage et les updates WebSocket.

## Maniere de coder

La logique task/artifact est centralisee dans `room-task-service.ts`.

Ce fichier fait trois choses importantes :

1. il ecrit en base ;
2. il serialize les objets au format temps reel attendu par le front ;
3. il cree les events associes.

Ce choix evite que chaque route fabrique ses propres events a la main. Les routes restent fines : elles valident l'entree, verifient l'acces, appellent le service, puis publient l'event.

Cote front, `RoomShell` demarre avec l'etat actuel des tasks via HTTP, puis applique les events WebSocket par-dessus. C'est ce qui permet d'avoir a la fois un chargement initial fiable et des updates live.

## Fichiers a lire

- `apps/api/src/routes/tasks.ts` : endpoints tasks/artifacts.
- `apps/api/src/room-task-service.ts` : coeur de la logique task, artifact, logs, versions et replay.
- `apps/api/src/room-event-bus.ts` : broadcast WebSocket en memoire.
- `apps/api/src/routes/room-events.ts` : WebSocket, replay et ingestion interne.
- `apps/web/src/lib/use-room-events.ts` : reconnexion WebSocket et replay cote front.
- `apps/web/src/components/room-shell.tsx` : tabs, renderers artifacts, logs et panneau events.
- `packages/shared/src/domain.ts` : schemas des events temps reel.
- `apps/api/src/routes.test.ts` : tests du lifecycle task/artifact/replay.

## Details a retenir

- Le WebSocket sert au live, mais la base reste la source durable.
- Les artifacts sont versionnes : un patch ne remplace pas juste un objet en memoire, il cree une nouvelle version.
- Les logs sont stockes comme des `TaskEvent` de type `task.log`.
- Le replay actuel reconstruit surtout les events persistants lies aux tasks/artifacts/agent speech. Les transcripts live sont affiches, et les finals sont aussi stockes en `TranscriptSegment`, mais le replay WebSocket n'est pas encore un historique complet de tous les transcripts.

## Limite actuelle

Le `RoomEventBus` est en memoire. C'est suffisant pour le dev et une premiere alpha locale, mais une production multi-instance aura besoin d'un bus partage ou d'une strategie de fan-out plus robuste.
