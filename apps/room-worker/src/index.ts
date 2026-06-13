import { dispose } from "@livekit/rtc-node";

import { readRoomWorkerConfig } from "./config.js";
import { createDeepgramSTTProvider } from "./deepgram-stt.js";
import { createLiveKitAudioSource } from "./livekit-audio-source.js";
import { runTranscriptionWorker } from "./transcription-worker.js";
import { createWorkroomApiPublisher } from "./workroom-api.js";

async function main(): Promise<void> {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
