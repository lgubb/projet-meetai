# Phase 2 - LiveKit audio/video

## But de la phase

La phase 2 ajoute la couche media : les participants d'une room peuvent se connecter a une session LiveKit pour parler et se voir.

Le principe important : Workroom ne reimplemente pas WebRTC. L'app delegue la complexite audio/video a LiveKit et garde dans son API la logique d'autorisation et de room.

## Ce qui a ete fait

- Route API `/rooms/:roomId/livekit-token`.
- Generation d'un token LiveKit limite a la room demandee.
- Verification que l'utilisateur a acces a la room avant de recevoir un token.
- Integration front avec `LiveKitRoom`, `ParticipantTile`, `ControlBar` et `RoomAudioRenderer`.
- Affichage des participants LiveKit et fallback quand un participant n'a pas de camera track.
- Variables d'environnement LiveKit documentees dans le README.

## Pourquoi c'est important

L'audio/video temps reel est un probleme specialise : connexions WebRTC, publication de tracks, abonnement aux tracks distantes, reconnexion, rendu audio, permissions navigateur.

LiveKit prend en charge cette couche. Workroom garde ce qui est specifique au produit :

- qui a le droit d'entrer dans la room ;
- quelle room LiveKit correspond a quelle room Workroom ;
- comment l'interface s'organise autour de la collaboration.

L'API ne donne pas un token global. Elle donne un token lie a une room et a un utilisateur. C'est une frontiere de securite importante.

## Outils utilises

- `livekit-server-sdk` cote API : creation des tokens.
- `@livekit/components-react` cote front : composants React prets pour la room media.
- `livekit-client` : client navigateur sous-jacent.

## Maniere de coder

La logique token est volontairement petite :

1. le front demande un token pour une room ;
2. l'API verifie l'acces a cette room ;
3. l'API signe un token avec les grants LiveKit ;
4. le front passe `serverUrl` et `token` a `LiveKitRoom`.

Dans le composant room, l'audio/video ne prend pas tout l'ecran. Il reste dans la colonne participants, car l'application vise une experience de workroom : media a gauche, artifact au centre, Jean/tasks/events a droite.

## Fichiers a lire

- `apps/api/src/livekit.ts` : creation du token LiveKit.
- `apps/api/src/routes/rooms.ts` : endpoint `/livekit-token`.
- `apps/web/src/components/room-shell.tsx` : integration LiveKit dans la room.
- `README.md` : variables `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- `apps/api/src/routes.test.ts` : tests du token room-scoped.

## Limite actuelle

La phase pose la connexion media et les controles. Le front initialise la room avec micro/camera eteints, puis l'utilisateur controle la publication via la barre LiveKit. La partie production fine, comme l'etat de presence en direct ou la moderation media, n'est pas encore le sujet.
