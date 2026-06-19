import assert from "node:assert/strict";
import test from "node:test";

import type { RealtimeRoomEvent } from "@jean/shared";

import { readRoomWorkerConfig } from "./config.js";
import { runTranscriptionWorker, type AudioChunk, type STTProvider } from "./transcription-worker.js";
import { createWorkroomApiPublisher } from "./workroom-api.js";

test("runTranscriptionWorker publishes typed partial and final transcript events", async () => {
  const publishedEvents: RealtimeRoomEvent[] = [];
  const sttProvider: STTProvider = {
    async *transcribeTrack(input) {
      assert.equal(input.speakerId, "user-1");

      yield {
        speakerId: input.speakerId,
        text: " Draft words ",
        isFinal: false,
        ts: new Date("2026-06-06T12:00:01.000Z")
      };
      yield {
        speakerId: input.speakerId,
        text: "Final words",
        isFinal: true,
        ts: new Date("2026-06-06T12:00:02.000Z"),
        startedAt: new Date("2026-06-06T12:00:00.000Z"),
        endedAt: new Date("2026-06-06T12:00:02.000Z")
      };
    }
  };

  await runTranscriptionWorker({
    roomId: "room-1",
    audioTracks: createAudioTracks(),
    sttProvider,
    publisher: {
      async publish(event) {
        publishedEvents.push(event);
      }
    }
  });

  assert.equal(publishedEvents.length, 2);
  const transcriptEvents = publishedEvents.filter(isTranscriptEvent);

  assert.deepEqual(
    transcriptEvents.map((event) => [event.type, event.speakerId, event.text]),
    [
      ["transcript.partial", "user-1", "Draft words"],
      ["transcript.final", "user-1", "Final words"]
    ]
  );
  assert.equal(transcriptEvents[1]?.startedAt, "2026-06-06T12:00:00.000Z");
  assert.equal(transcriptEvents[1]?.endedAt, "2026-06-06T12:00:02.000Z");
});

test("createWorkroomApiPublisher posts events to the internal API", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const publisher = createWorkroomApiPublisher({
    apiUrl: "http://127.0.0.1:3001",
    workerToken: "worker-secret",
    fetchFn: async (url, init) => {
      requests.push({
        url: String(url),
        init: init ?? {}
      });

      return new Response("{}", {
        status: 202
      });
    }
  });

  await publisher.publish({
    type: "transcript.partial",
    roomId: "room-1",
    speakerId: "user-1",
    text: "Hello",
    ts: "2026-06-06T12:00:00.000Z"
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "http://127.0.0.1:3001/internal/rooms/room-1/events");
  assert.equal(requests[0]?.init.method, "POST");
  assert.equal((requests[0]?.init.headers as Headers).get("authorization"), "Bearer worker-secret");
  assert.equal(
    requests[0]?.init.body,
    JSON.stringify({
      type: "transcript.partial",
      roomId: "room-1",
      speakerId: "user-1",
      text: "Hello",
      ts: "2026-06-06T12:00:00.000Z"
    })
  );
});

test("readRoomWorkerConfig defaults Deepgram to multilingual streaming", () => {
  const config = readRoomWorkerConfig({
    WORKROOM_ROOM_ID: "room-1",
    LIVEKIT_URL: "wss://livekit.example.test",
    LIVEKIT_API_KEY: "livekit-key",
    LIVEKIT_API_SECRET: "livekit-secret",
    DEEPGRAM_API_KEY: "deepgram-key"
  });

  assert.equal(config.deepgram.model, "nova-3");
  assert.equal(config.deepgram.language, "multi");
  assert.equal(config.deepgram.endpointing, 100);
  assert.equal(config.jeanVoice.enabled, true);
  assert.equal(config.jeanVoice.model, "aura-2-thalia-en");
  assert.equal(config.jeanVoice.sampleRate, 16000);
  assert.equal(config.jeanVoice.minIntervalMs, 2500);
});

async function* createAudioTracks() {
  yield {
    speakerId: "user-1",
    audio: createAudio()
  };
}

async function* createAudio(): AsyncIterable<AudioChunk> {
  yield {
    data: new Int16Array([1, 2]),
    sampleRate: 16000,
    channels: 1
  };
}

function isTranscriptEvent(
  event: RealtimeRoomEvent
): event is Extract<RealtimeRoomEvent, { type: "transcript.partial" | "transcript.final" }> {
  return event.type === "transcript.partial" || event.type === "transcript.final";
}
