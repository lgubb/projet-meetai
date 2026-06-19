# Phase 11 - Policy Guard, permissions et audit

Statut au 2026-06-19 : **Phase 11H policy rule admin livree.**

## But de la phase

La Phase 11 durcit le systeme quand plusieurs agents et utilisateurs agissent
dans la meme room. Les actions sensibles doivent etre bloquees sans approval,
et l'historique doit permettre de comprendre qui a appele quoi, avec quels
arguments, et quel resultat.

## Ce qui est pose

- `AgentToolCall` persiste chaque `tools/call` MCP HTTP room-scoped.
- Chaque tool call garde :
  - `roomId`, `agentId`, `taskId`, `artifactId`, `approvalId` quand connus ;
  - `toolName` ;
  - status `RUNNING`, `SUCCEEDED`, `FAILED` ou `BLOCKED` ;
  - arguments nettoyes des secrets ;
  - resultat structure ou erreur MCP ;
  - timestamps et duree.
- Les appels bloques par le Policy Guard sont marques `BLOCKED`.
- La route `GET /rooms/:roomId/tool-calls` expose les 100 derniers appels pour
  les membres de la room.
- Les tools preview/artifact sensibles verifient les capacites de l'agent :
  `PROTOTYPING` pour preview, `CODE_GENERATION` pour code, `RESEARCH` pour
  research, `ARTIFACT_GENERATION` pour document/diagram/log.
- Les tests prouvent un appel reussi (`agent.start_run`), un appel bloque
  (`room.set_preview_url`), un rejet par capacite manquante et la lecture HTTP
  de l'historique.
- La room UI expose maintenant un panneau `Tool calls` dedie :
  - chargement des 100 derniers appels ;
  - filtres par status `RUNNING`, `SUCCEEDED`, `FAILED`, `BLOCKED` ;
  - refresh manuel et polling leger ;
  - inspection compacte des arguments nettoyes et du resultat.
- Les decisions d'approval sont limitees aux utilisateurs avec role
  organisation `OWNER` / `ADMIN` ou role room `HOST`. Un membre simple peut lire
  l'approval mais ne peut pas l'approuver ou la rejeter.
- Une surface policy read-only est exposee via `GET /rooms/:roomId/policy` et
  dans la sidebar de room. Elle montre :
  - si l'utilisateur courant peut decider les approvals ;
  - les roles org/room qui expliquent cette decision ;
  - les actions sensibles connues et leur risk level.
- La route humaine `PATCH /rooms/:roomId/artifacts/:artifactId/preview-url`
  est maintenant couverte par la meme action sensible `publish_preview` :
  sans approval elle cree une demande `PENDING` et renvoie `202`, puis elle ne
  publie l'URL qu'apres une approval approuvee et scopee a l'artifact et a
  l'URL cible.
- Le test lifecycle prouve que cette route ne cree pas de nouvelle version
  d'artifact avant approval, puis publie bien apres decision humaine.
- La creation de sessions agent `POST /rooms/:roomId/agent-sessions` est
  reservee aux org `OWNER` / `ADMIN` ou room `HOST`. Un membre simple peut lire
  la policy mais ne peut plus creer un agent avec des capacites arbitraires.
- La surface policy expose un bloc `Agent sessions` separe de `Approval
  decisions`, pour rendre visibles les permissions fines room/user.
- L'administration des membres d'organisation est exposee :
  - `GET /organizations/:organizationId/members` liste les membres et leurs
    roles ;
  - `PATCH /organizations/:organizationId/members/:userId` permet a un
    `OWNER` de promouvoir/degrader `ADMIN` / `MEMBER` ;
  - le dernier `OWNER` ne peut pas etre degrade ;
  - le dashboard affiche le panneau `Members` et rend les roles modifiables
    uniquement pour un owner.
- Les regles policy sensibles connues sont configurables par organisation :
  - `OrganizationPolicyRuleOverride` persiste un niveau de risque effectif par
    regle ;
  - `PATCH /rooms/:roomId/policy/rules/:ruleId` est reserve aux org `OWNER` /
    `ADMIN` ;
  - l'UI `Policy` permet de durcir le niveau de risque d'une regle sensible ;
  - les approvals restent obligatoires et une regle ne peut pas etre affaiblie
    sous son niveau de base ;
  - les routes humaines et les tools MCP utilisent le meme niveau effectif.

## Ce qui reste

- Couverture R2/R3 sur les prochaines actions sensibles quand elles sont
  ajoutees au produit.

## Fichiers a lire

- `packages/db/prisma/schema.prisma` : modeles `AgentToolCall` et
  `OrganizationPolicyRuleOverride`.
- `apps/api/src/policy-guard.ts` : regles sensibles de base, overrides
  organisation et verification du niveau de risque.
- `apps/api/src/room-mcp-service.ts` : enregistrement autour de `tools/call`.
- `apps/api/src/routes/room-mcp.ts` : routes `/tool-calls`, `/policy`, edition
  de regles et decisions d'approval.
- `apps/web/src/components/room-shell.tsx` : panneaux `Policy` et `Tool calls`.
- `apps/api/src/routes.test.ts` : assertions success/blocked/replay.
