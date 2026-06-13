import { DeepgramClient } from "@deepgram/sdk";

import { AsyncQueue } from "./async-queue.js";
import type { STTProvider, TranscriptResult } from "./transcription-worker.js";

type DeepgramListenResults = {
  type: "Results";
  start: number;
  duration: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel: {
    alternatives: Array<{
      transcript: string;
    }>;
  };
};

export type DeepgramSTTProviderOptions = {
  apiKey: string;
  model?: string;
  language?: string;
  sampleRate?: number;
  endpointing?: number;
};

export function createDeepgramSTTProvider(options: DeepgramSTTProviderOptions): STTProvider {
  const sampleRate = options.sampleRate ?? 16000;
  const endpointing = options.endpointing ?? 100;

  return {
    async *transcribeTrack(input) {
      const client = new DeepgramClient({ apiKey: options.apiKey });
      const connection = await client.listen.v1.connect({
        Authorization: `Token ${options.apiKey}`,
        encoding: "linear16",
        endpointing,
        interim_results: "true",
        language: options.language ?? "multi",
        model: options.model ?? "nova-3",
        punctuate: "true",
        sample_rate: sampleRate,
        smart_format: "true"
      });
      const queue = new AsyncQueue<TranscriptResult>();
      const streamStartedAt = new Date();

      connection.on("message", (message) => {
        if (message.type !== "Results") {
          return;
        }

        const result = toTranscriptResult(input.speakerId, message, streamStartedAt);

        if (result) {
          queue.push(result);
        }
      });
      connection.on("error", (error) => queue.fail(error));
      connection.on("close", () => queue.close());

      connection.connect();
      await connection.waitForOpen();

      const audioPump = pumpAudio(input.audio, connection, input.signal, queue);

      try {
        yield* queue;
      } finally {
        connection.close();
        await audioPump.catch(() => undefined);
      }
    }
  };
}

async function pumpAudio(
  audio: AsyncIterable<{ data: Int16Array }>,
  connection: { sendMedia(message: ArrayBufferView): void; close(): void },
  signal: AbortSignal | undefined,
  queue: AsyncQueue<TranscriptResult>
): Promise<void> {
  try {
    for await (const chunk of audio) {
      if (signal?.aborted) {
        break;
      }

      connection.sendMedia(chunk.data);
    }
  } catch (error) {
    queue.fail(error);
  } finally {
    connection.close();
  }
}

function toTranscriptResult(
  speakerId: string,
  message: DeepgramListenResults,
  streamStartedAt: Date
): TranscriptResult | null {
  const text = message.channel.alternatives[0]?.transcript.trim();

  if (!text) {
    return null;
  }

  const startedAt = offsetDate(streamStartedAt, message.start);
  const endedAt = offsetDate(streamStartedAt, message.start + message.duration);

  return {
    speakerId,
    text,
    isFinal: message.is_final === true || message.speech_final === true,
    ts: new Date(),
    startedAt,
    endedAt
  };
}

function offsetDate(base: Date, seconds: number): Date {
  return new Date(base.getTime() + seconds * 1000);
}
