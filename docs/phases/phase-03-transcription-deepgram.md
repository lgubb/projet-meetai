# Phase 3 - Transcription Deepgram

## But de la phase

La phase 3 transforme la voix en texte exploitable par l'application. C'est le pont entre la discussion humaine et les actions futures de Jean.

Le choix cle : la transcription tourne dans un worker separe, pas directement dans le front ni dans les routes API.

## Ce qui a ete fait

- Application `apps/room-worker`.
- Connexion du worker a LiveKit avec une identite systeme `jean-transcriber`.
- Ecoute des audio tracks distantes dans une room.
- Envoi des chunks audio a Deepgram en streaming.
- Production d'events `transcript.partial` et `transcript.final`.
- Publication des events vers l'API interne `/internal/rooms/:roomId/events`.
- Protection optionnelle de l'ingestion par `WORKROOM_WORKER_TOKEN`.
- Persistance des transcripts finaux dans `TranscriptSegment`.
- Diffusion des transcripts en live via WebSocket dans la room.
- Voix courte de Jean via Deepgram TTS quand le worker reel voit un event
  `agent.speech`.
- Publication audio LiveKit sur une piste systeme `jean-voice`, avec fallback
  texte-only si la synthese ou la publication audio echoue.

## Pourquoi c'est important

Il y a deux types de transcript :

- `partial` : texte temporaire, utile pour voir que la parole est reconnue en direct ;
- `final` : segment stabilise, assez fiable pour etre stocke et declencher une action.

Cette separation evite de lancer Jean sur des phrases inachevees. L'app attend le transcript final pour prendre une decision.

Le worker separe protege aussi l'API. L'audio streaming est continu, potentiellement long, et depend de services externes. Le sortir des routes HTTP classiques rend le systeme plus propre et plus facile a faire evoluer.

## Outils utilises

- `@livekit/rtc-node` : connexion serveur a LiveKit et lecture des audio tracks.
- Deepgram SDK : transcription speech-to-text en streaming.
- Async iterables : modele de code utilise pour traiter des flux audio et des resultats au fil de l'eau.
- WebSocket Fastify : diffusion live des events vers le front.

## Maniere de coder

Le pipeline est decoupe en petits roles :

1. `livekit-audio-source.ts` fournit des tracks audio humaines.
2. `deepgram-stt.ts` transforme l'audio en resultats de transcription.
3. `transcription-worker.ts` convertit ces resultats en events Workroom valides.
4. `workroom-api.ts` poste ces events a l'API.
5. `routes/room-events.ts` valide, persiste si besoin, puis publie.
6. `jean-voice.ts` ecoute les `agent.speech` via WebSocket room authentifie
   par worker token, throttle les phrases et appelle le provider TTS.
7. `livekit-voice-output.ts` transforme le PCM TTS en frames audio LiveKit.

Cette separation permet de tester la transcription sans se connecter a LiveKit ou Deepgram a chaque fois.

## Fichiers a lire

- `apps/room-worker/src/index.ts` : point d'entree du worker.
- `apps/room-worker/src/config.ts` : variables d'environnement du worker.
- `apps/room-worker/src/livekit-audio-source.ts` : source audio LiveKit.
- `apps/room-worker/src/deepgram-stt.ts` : integration Deepgram.
- `apps/room-worker/src/transcription-worker.ts` : conversion audio -> events transcript.
- `apps/room-worker/src/deepgram-tts.ts` : integration Deepgram text-to-speech.
- `apps/room-worker/src/jean-voice.ts` : pipeline `agent.speech` -> TTS.
- `apps/room-worker/src/livekit-voice-output.ts` : publication audio LiveKit.
- `apps/room-worker/src/workroom-api.ts` : publication vers l'API.
- `apps/api/src/routes/room-events.ts` : ingestion interne, persistance et broadcast.
- `apps/room-worker/src/*.test.ts` : tests transcription, TTS et fallback voix.

## Limite actuelle

Le worker est configure pour une room via `WORKROOM_ROOM_ID`. Le code contient deja une note indiquant que la production devra superviser plusieurs rooms actives et les repartir proprement.
