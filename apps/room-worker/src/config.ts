export type RoomWorkerConfig = {
  roomId: string;
  workroomApiUrl: string;
  workerToken: string | null;
  liveKit: {
    serverUrl: string;
    apiKey: string;
    apiSecret: string;
    identity: string;
    name: string;
  };
  deepgram: {
    apiKey: string;
    model: string;
    language: string;
    sampleRate: number;
    endpointing: number;
  };
};

export function readRoomWorkerConfig(env: NodeJS.ProcessEnv = process.env): RoomWorkerConfig {
  return {
    roomId: readRequiredEnv(env, "WORKROOM_ROOM_ID"),
    workroomApiUrl: env.WORKROOM_API_URL?.trim() || "http://127.0.0.1:3001",
    workerToken: env.WORKROOM_WORKER_TOKEN?.trim() || null,
    liveKit: {
      serverUrl: readRequiredEnv(env, "LIVEKIT_URL"),
      apiKey: readRequiredEnv(env, "LIVEKIT_API_KEY"),
      apiSecret: readRequiredEnv(env, "LIVEKIT_API_SECRET"),
      identity: env.WORKROOM_TRANSCRIBER_IDENTITY?.trim() || "jean-transcriber",
      name: env.WORKROOM_TRANSCRIBER_NAME?.trim() || "Jean Transcriber"
    },
    deepgram: {
      apiKey: readRequiredEnv(env, "DEEPGRAM_API_KEY"),
      model: env.DEEPGRAM_MODEL?.trim() || "nova-3",
      language: env.DEEPGRAM_LANGUAGE?.trim() || "multi",
      sampleRate: Number(env.DEEPGRAM_SAMPLE_RATE ?? 16000),
      endpointing: Number(env.DEEPGRAM_ENDPOINTING ?? 100)
    }
  };
}

function readRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
