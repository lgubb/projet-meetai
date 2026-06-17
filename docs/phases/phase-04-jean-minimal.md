# Phase 4 - Jean minimal

## But de la phase

La phase 4 donne une premiere existence a Jean dans la room. Le but n'est pas encore d'avoir une IA complete, mais de prouver la boucle :

voix humaine -> transcript final -> detection d'une commande -> creation d'une task -> artifact visible dans l'interface.

## Ce qui a ete fait

- Package `@jean/jean-core` avec detection de commande.
- Detection explicite de phrases adressees a Jean, par exemple `Jean, cree une spec`.
- Parsing simple d'intentions : document, recherche, code, prototype, diagramme, workflow.
- Mapping intention -> type d'artifact : `DOCUMENT`, `RESEARCH`, `CODE`, etc.
- Creation automatique d'un agent `Jean` en base si necessaire.
- Creation d'une task et d'un artifact quand Jean comprend une commande.
- Publication d'un event `agent.speech` pour afficher la reponse de Jean.
- Runner local qui simule le travail de Jean avec logs et patch d'artifact.
- Affichage de Jean, de ses messages et des tasks dans la room.

## Pourquoi c'est important

Cette phase valide le concept produit sans ajouter tout de suite un LLM ou un connecteur externe.

Le parseur est volontairement simple et deterministe. Il ne pretend pas comprendre tout le langage naturel. Il repond a une question plus fondamentale : est-ce que l'architecture permet de transformer une parole en travail visible ?

La reponse est oui :

1. Deepgram produit un transcript final.
2. L'API appelle Jean.
3. Jean decide si la phrase lui est adressee.
4. Jean cree une task/artifact.
5. La room se met a jour en live.

## Outils utilises

- TypeScript pur dans `@jean/jean-core` pour garder la detection testable.
- Prisma pour representer Jean comme un `Agent` en base.
- Events temps reel pour rendre les actions de Jean visibles.
- Tests Node natifs pour verifier les commandes et le flow end-to-end.

## Maniere de coder

Le choix principal est d'isoler la comprehension minimale dans `jean-core`.

`jean-core` ne depend pas de Fastify, Prisma ou du front. Il prend du texte et retourne une intention. Ensuite, l'API se charge de transformer cette intention en objets metier : agent, task, artifact, events.

Ce decoupage est important parce que la comprehension de Jean pourra changer plus tard. On pourra remplacer ou enrichir le parseur sans casser la logique de room.

## Fichiers a lire

- `packages/jean-core/src/index.ts` : detection de commande et parsing d'intention.
- `packages/jean-core/src/index.test.ts` : cas de test du parseur.
- `apps/api/src/jean-flow.ts` : branchement transcript final -> Jean -> task/artifact.
- `apps/api/src/jean-task-runner.ts` : runner local de Jean.
- `apps/web/src/components/room-shell.tsx` : panneau Jean, tasks et artifacts.
- `apps/api/src/routes.test.ts` : test ou `Jean, cree une spec` cree une task.

## Limite actuelle

Jean n'est pas encore une IA generaliste. Le contenu genere est un mock local structure. C'est volontaire : la phase 4 pose la boucle produit. Les phases suivantes branchent des connecteurs plus puissants, comme Perplexity pour la recherche.
