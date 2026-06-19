# Phase 12 - Alpha privee

## Resume

Phase 12A pose le premier morceau d'alpha onboarding : la creation de room peut maintenant partir d'un template simple.

Phase 12B ajoute un panneau `Alpha setup` sur le dashboard. Il montre l'etat
minimal de demarrage : profile, organisation, template et premiere room.

Phase 12C ajoute des metriques usage read-only par organisation pour suivre
l'activite alpha sans ajouter de tracking comportemental.

Phase 12D ajoute des limites alpha configurables. Elles sont exposees avec les
metriques usage pour voir rapidement si une organisation approche ou depasse un
seuil. Aucun prix fournisseur n'est invente tant que les couts reels audio,
LLM, sandbox et connecteurs ne sont pas collectes.

Phase 12E ajoute une waitlist billing manuelle par organisation.

Phase 12F finalise la documentation d'installation bridge alpha.

Phase 12G ferme le volet couts alpha avec une source manuelle de couts reels :
les montants viennent des factures ou exports fournisseurs, puis sont saisis par
organisation. Il n'y a pas d'estimation automatique.

Phase 12H ajoute une conversion multi-devise auditable : les taux FX sont saisis
manuellement depuis une facture ou un export finance, dates, puis l'API calcule
un total converti dans la devise de reporting choisie.

Phase 12I ajoute la recuperation automatique d'un taux FX externe a la demande :
le dashboard peut demander un taux Frankfurter v2 filtre `providers=ECB`, l'API
persiste ce taux dans `ProviderExchangeRate`, puis le resume converti reutilise
le meme calcul auditable que les taux manuels. Doc provider :
`https://frankfurter.dev/`.

Phase 12J ajoute une base automatique d'unites fournisseur internes : la route
`usage` expose les minutes LiveKit participants fermees, les minutes Deepgram
STT issues des transcripts horodates, les minutes E2B issues des sandbox
sessions et les failures connecteurs depuis les tool calls. Aucun prix n'est
calcule ici.

Templates disponibles :

- `blank` : room vide, comportement historique conserve ;
- `product_jam` : starter task de decisions produit avec artifact `DOCUMENT` ;
- `research_call` : starter task de synthese recherche avec artifact `RESEARCH` ;
- `prototype_session` : starter task de cadrage prototype avec artifact `PREVIEW`.

Chaque template non blank cree une seule task et un seul artifact. Il n'y a pas de systeme administrable, pas de migration et pas de workflow cache.

## Pourquoi c'est important

L'alpha a besoin d'une entree rapide dans une room utile. Les templates donnent une intention de session claire sans forcer Jean ou un agent externe a deviner le format attendu.

Le choix volontaire est de rester minimal : un starter artifact structure suffit pour guider la session, puis les mecanismes existants prennent le relais.

## Ce qui existe dans le code

- `packages/shared/src/domain.ts` expose `roomTemplateIdSchema` et `RoomTemplateId`.
- `apps/api/src/routes/rooms.ts` accepte `templateId` a la creation de room et seed les starter tasks via `createTaskWithArtifact`.
- `apps/web/src/components/workroom-dashboard.tsx` affiche le selecteur de templates dans le formulaire de creation.
- `apps/web/src/components/workroom-dashboard.tsx` affiche aussi le setup dashboard minimal pour guider une equipe alpha sans nouveau modele persiste.
- `apps/api/src/routes/rooms.ts` expose `GET /organizations/:organizationId/usage` avec compteurs rooms, tasks, artifacts, agents, approvals et tool calls.
- `apps/api/src/routes/rooms.ts` ajoute `usage.limits` avec `used`, `limit`, `remaining` et `isOverLimit` pour chaque compteur principal.
- `apps/web/src/components/workroom-dashboard.tsx` affiche ces compteurs dans un panneau `Usage` pour l'organisation selectionnee.
- `.env.example` documente les seuils `WORKROOM_ALPHA_MAX_*`.
- `packages/db/prisma/schema.prisma` ajoute `BillingWaitlistEntry` avec unicite `organizationId + email`.
- `apps/api/src/routes/organizations.ts` expose `GET/POST /organizations/:organizationId/billing-waitlist`.
- `apps/web/src/components/workroom-dashboard.tsx` affiche le panneau `Billing waitlist` avec note courte et upsert de l'utilisateur courant.
- `docs/bridge-installation.md` documente le pairing `jean-bridge pair`, les commandes utiles, le fallback YAML, le modele de securite et le troubleshooting.
- `packages/db/prisma/schema.prisma` ajoute `ProviderCostEntry` pour stocker des couts fournisseurs reels par organisation.
- `apps/api/src/routes/organizations.ts` expose `GET/POST /organizations/:organizationId/provider-costs` avec resume par devise.
- `apps/web/src/components/workroom-dashboard.tsx` affiche le panneau `Provider costs` et permet de saisir un cout manuel facture/export.
- `packages/db/prisma/schema.prisma` ajoute `ProviderExchangeRate` pour stocker les taux FX manuels par organisation.
- `apps/api/src/routes/organizations.ts` expose `GET/POST /organizations/:organizationId/provider-exchange-rates`.
- `GET /organizations/:organizationId/provider-costs?reportingCurrency=USD` retourne un `convertedSummary` avec total converti, nombre d'entrees converties et devises manquantes.
- `apps/web/src/components/workroom-dashboard.tsx` permet de choisir la devise de reporting, saisir un taux et voir le total converti.
- `apps/api/src/routes/organizations.ts` expose aussi `POST /organizations/:organizationId/provider-exchange-rates/fetch` pour recuperer un taux Frankfurter ECB sans cle API.
- `apps/web/src/components/workroom-dashboard.tsx` ajoute l'action `Fetch ECB rate` dans le panneau `Provider costs`.
- `GET /organizations/:organizationId/usage` retourne aussi `providerUsage` avec minutes LiveKit participants, minutes Deepgram STT, minutes E2B sandbox et failures connecteurs.
- `apps/web/src/components/workroom-dashboard.tsx` affiche ces unites fournisseur dans le panneau `Usage`, separees des limites alpha.
- `apps/api/src/routes.test.ts` prouve que `blank` ne seed rien, que les trois templates seedent chacun une task/artifact, et qu'un template inconnu est rejete.
- `apps/api/src/routes.test.ts` prouve aussi le resume usage apres creation des rooms template.
- `apps/api/src/routes.test.ts` prouve la saisie de taux EUR -> USD, le calcul du total converti et le signalement des taux manquants.
- `apps/api/src/routes.test.ts` prouve la recuperation Frankfurter ECB avec `fetch` mocke, la persistance du taux et son usage dans `convertedSummary`.
- `apps/api/src/routes.test.ts` prouve que les unites fournisseur sont calculees depuis l'activite persistee sans appel externe ni prix invente.

## Non fait

- integrations automatiques avec les APIs billing fournisseurs reelles ;
