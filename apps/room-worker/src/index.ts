import { dispose } from "@livekit/rtc-node";

import { readRoomWorkerConfig } from "./config.js";
import { createDeepgramSTTProvider } from "./deepgram-stt.js";
import { createDeepgramTTSProvider } from "./deepgram-tts.js";
import { createRoomSpeechEventSource, runJeanVoiceWorker } from "./jean-voice.js";
import { createLiveKitAudioSource } from "./livekit-audio-source.js";
import { createLiveKitVoiceOutput } from "./livekit-voice-output.js";
import { runTranscriptionWorker } from "./transcription-worker.js";
import { createWorkroomApiPublisher } from "./workroom-api.js";

async function main(): Promise<void> {
  if (process.env.WORKROOM_ROOM_WORKER_MODE?.trim().toLowerCase() === "mock") {
    await runMockRoomWorker();
    return;
  }

  const config = readRoomWorkerConfig();
  const abortController = new AbortController();
  const audioSource = await createLiveKitAudioSource({
    roomId: config.roomId,
    serverUrl: config.liveKit.serverUrl,
    apiKey: config.liveKit.apiKey,
    apiSecret: config.liveKit.apiSecret,
    identity: config.liveKit.identity,
    name: config.liveKit.name,
    sampleRate: config.deepgram.sampleRate,
    channels: 1,
    canPublish: config.jeanVoice.enabled
  });
  const voiceOutput = config.jeanVoice.enabled
    ? await createLiveKitVoiceOutput(audioSource.room, {
        sampleRate: config.jeanVoice.sampleRate,
        trackName: config.jeanVoice.trackName
      })
    : null;
  const shutdown = () => {
    abortController.abort();
    void audioSource.disconnect();
    void voiceOutput?.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    const voiceTask = voiceOutput
      ? runJeanVoiceWorker({
          minIntervalMs: config.jeanVoice.minIntervalMs,
          onError: (error) => {
            console.warn("Jean voice fallback to text-only.", error);
          },
          signal: abortController.signal,
          source: createRoomSpeechEventSource({
            apiUrl: config.workroomApiUrl,
            roomId: config.roomId,
            signal: abortController.signal,
            workerToken: config.workerToken
          }),
          ttsProvider: createDeepgramTTSProvider({
            apiKey: config.deepgram.apiKey,
            model: config.jeanVoice.model,
            sampleRate: config.jeanVoice.sampleRate
          }),
          voiceOutput
        })
      : null;

    await runTranscriptionWorker({
      roomId: config.roomId,
      audioTracks: audioSource,
      sttProvider: createDeepgramSTTProvider(config.deepgram),
      publisher: createWorkroomApiPublisher({
        apiUrl: config.workroomApiUrl,
        workerToken: config.workerToken
      }),
      signal: abortController.signal
    });

    abortController.abort();
    await voiceTask?.catch(() => undefined);
  } finally {
    await voiceOutput?.close();
    await audioSource.disconnect();
    dispose();
  }
}

async function runMockRoomWorker(): Promise<void> {
  const roomId = process.env.WORKROOM_ROOM_ID?.trim() || "dev-local-room";

  console.log(`Room worker mock mode active for ${roomId}.`);

  await new Promise<void>((resolve) => {
    const shutdown = () => resolve();

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
