import { dispose } from "@livekit/rtc-node";

import { readRoomWorkerConfig } from "./config.js";
import { createDeepgramSTTProvider } from "./deepgram-stt.js";
import { createLiveKitAudioSource } from "./livekit-audio-source.js";
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
    channels: 1
  });
  const shutdown = () => {
    abortController.abort();
    void audioSource.disconnect();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
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
  } finally {
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
