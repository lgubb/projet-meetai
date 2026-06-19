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
  jeanVoice: {
    enabled: boolean;
    model: string;
    sampleRate: number;
    minIntervalMs: number;
    trackName: string;
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
    },
    jeanVoice: {
      enabled: readBooleanEnv(env, "WORKROOM_JEAN_VOICE_ENABLED", true),
      model: env.DEEPGRAM_TTS_MODEL?.trim() || "aura-2-thalia-en",
      sampleRate: Number(env.DEEPGRAM_TTS_SAMPLE_RATE ?? 16000),
      minIntervalMs: Number(env.WORKROOM_JEAN_VOICE_MIN_INTERVAL_MS ?? 2500),
      trackName: env.WORKROOM_JEAN_VOICE_TRACK_NAME?.trim() || "jean-voice"
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

function readBooleanEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: boolean): boolean {
  const value = env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value.`);
}
