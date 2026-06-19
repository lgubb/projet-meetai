import { realtimeRoomEventSchema, type RealtimeRoomEvent } from "@jean/shared";

import { AsyncQueue } from "./async-queue.js";
import type { SpeechAudio, TTSProvider } from "./deepgram-tts.js";

type AgentSpeechEvent = Extract<RealtimeRoomEvent, { type: "agent.speech" }>;

export type SpeechEventSource = AsyncIterable<AgentSpeechEvent>;

export type VoiceOutput = {
  speak(audio: SpeechAudio, signal?: AbortSignal): Promise<void>;
};

export type JeanVoiceWorkerOptions = {
  minIntervalMs: number;
  nowMs?: () => number;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
  source: SpeechEventSource;
  ttsProvider: TTSProvider;
  voiceOutput: VoiceOutput;
};

export async function runJeanVoiceWorker(options: JeanVoiceWorkerOptions): Promise<void> {
  const nowMs = options.nowMs ?? Date.now;
  let lastSpeechAt = Number.NEGATIVE_INFINITY;

  for await (const event of options.source) {
    if (options.signal?.aborted) {
      return;
    }

    const text = event.text.trim();

    if (!text || nowMs() - lastSpeechAt < options.minIntervalMs) {
      continue;
    }

    lastSpeechAt = nowMs();

    try {
      const audio = await options.ttsProvider.synthesize({
        text,
        signal: options.signal
      });

      await options.voiceOutput.speak(audio, options.signal);
    } catch (error) {
      options.onError?.(error);
    }
  }
}

export type RoomSpeechEventSourceOptions = {
  apiUrl: string;
  roomId: string;
  signal?: AbortSignal;
  workerToken?: string | null;
  webSocketConstructor?: WebSocketConstructor;
};

type WebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> }
) => WebSocketLike;

type WebSocketLike = {
  addEventListener(type: "close" | "error" | "message", listener: (event: WebSocketEvent) => void): void;
  close(): void;
};

type WebSocketEvent = {
  data?: unknown;
};

export function createRoomSpeechEventSource(options: RoomSpeechEventSourceOptions): SpeechEventSource {
  const WebSocketClient = options.webSocketConstructor ?? readGlobalWebSocket();

  return {
    [Symbol.asyncIterator]() {
      const queue = new AsyncQueue<AgentSpeechEvent>();
      const socket = new WebSocketClient(createRoomEventsUrl(options), undefined, {
        headers: options.workerToken
          ? {
              authorization: `Bearer ${options.workerToken}`
            }
          : undefined
      });
      const abort = () => {
        socket.close();
        queue.close();
      };

      if (options.signal?.aborted) {
        abort();
      } else {
        options.signal?.addEventListener("abort", abort, {
          once: true
        });
      }

      socket.addEventListener("message", (message) => {
        try {
          const event = realtimeRoomEventSchema.parse(JSON.parse(String(message.data)));

          if (event.type === "agent.speech") {
            queue.push(event);
          }
        } catch {
          // Invalid room events are ignored; the browser timeline remains the debugging surface.
        }
      });
      socket.addEventListener("close", () => queue.close());
      socket.addEventListener("error", () => queue.close());

      return queue[Symbol.asyncIterator]();
    }
  };
}

function createRoomEventsUrl(options: RoomSpeechEventSourceOptions): string {
  const apiUrl = new URL(options.apiUrl);
  const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(`/rooms/${encodeURIComponent(options.roomId)}/events`, `${protocol}//${apiUrl.host}`);

  return url.toString();
}

function readGlobalWebSocket(): WebSocketConstructor {
  const WebSocketClient = globalThis.WebSocket as unknown as WebSocketConstructor | undefined;

  if (!WebSocketClient) {
    throw new Error("This Node.js runtime does not expose WebSocket. Use Node.js 22.12 or newer.");
  }

  return WebSocketClient;
}
