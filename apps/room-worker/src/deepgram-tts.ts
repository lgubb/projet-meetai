export type SpeechAudio = {
  data: Int16Array;
  sampleRate: number;
  channels: number;
};

export type TTSProvider = {
  synthesize(input: { text: string; signal?: AbortSignal }): Promise<SpeechAudio>;
};

export type DeepgramTTSConfig = {
  apiKey: string;
  model: string;
  sampleRate: number;
};

export type DeepgramTTSOptions = {
  baseUrl?: string;
  fetchFn?: typeof fetch;
};

export function createDeepgramTTSProvider(config: DeepgramTTSConfig, options: DeepgramTTSOptions = {}): TTSProvider {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.deepgram.com";

  return {
    async synthesize(input) {
      const response = await fetchFn(createSpeakUrl(baseUrl, config), {
        body: JSON.stringify({
          text: input.text
        }),
        headers: {
          accept: "audio/raw",
          authorization: `Token ${config.apiKey}`,
          "content-type": "application/json"
        },
        method: "POST",
        signal: input.signal
      });

      if (!response.ok) {
        throw new Error(`Deepgram TTS rejected speech with ${response.status}.`);
      }

      return {
        channels: 1,
        data: arrayBufferToInt16(await response.arrayBuffer()),
        sampleRate: config.sampleRate
      };
    }
  };
}

function createSpeakUrl(baseUrl: string, config: DeepgramTTSConfig): string {
  const url = new URL("/v1/speak", baseUrl);

  url.searchParams.set("model", config.model);
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("container", "none");
  url.searchParams.set("sample_rate", String(config.sampleRate));

  return url.toString();
}

function arrayBufferToInt16(buffer: ArrayBuffer): Int16Array {
  if (buffer.byteLength % 2 !== 0) {
    throw new Error("Deepgram TTS returned an invalid linear16 payload.");
  }

  return new Int16Array(buffer);
}
