import assert from "node:assert/strict";
import test from "node:test";

import type { RealtimeRoomEvent } from "@jean/shared";

import type { SpeechAudio, TTSProvider } from "./deepgram-tts.js";
import { runJeanVoiceWorker, type VoiceOutput } from "./jean-voice.js";

test("runJeanVoiceWorker throttles Jean speech audio", async () => {
  const spokenTexts: string[] = [];
  const playedAudio: SpeechAudio[] = [];
  const clock = createClock([1000, 1000, 1200, 4000, 4000]);
  const ttsProvider: TTSProvider = {
    async synthesize(input) {
      spokenTexts.push(input.text);

      return createSpeechAudio([spokenTexts.length]);
    }
  };
  const voiceOutput: VoiceOutput = {
    async speak(audio) {
      playedAudio.push(audio);
    }
  };

  await runJeanVoiceWorker({
    minIntervalMs: 2500,
    nowMs: clock,
    source: createSpeechEvents(["First", "Second", "Third"]),
    ttsProvider,
    voiceOutput
  });

  assert.deepEqual(spokenTexts, ["First", "Third"]);
  assert.equal(playedAudio.length, 2);
});

test("runJeanVoiceWorker falls back to text-only when TTS fails", async () => {
  const errors: unknown[] = [];
  const playedAudio: SpeechAudio[] = [];
  let callCount = 0;
  const ttsProvider: TTSProvider = {
    async synthesize() {
      callCount += 1;

      if (callCount === 1) {
        throw new Error("TTS failed");
      }

      return createSpeechAudio([2]);
    }
  };
  const voiceOutput: VoiceOutput = {
    async speak(audio) {
      playedAudio.push(audio);
    }
  };

  await runJeanVoiceWorker({
    minIntervalMs: 0,
    onError(error) {
      errors.push(error);
    },
    source: createSpeechEvents(["First", "Second"]),
    ttsProvider,
    voiceOutput
  });

  assert.equal(errors.length, 1);
  assert.equal(playedAudio.length, 1);
  assert.deepEqual(Array.from(playedAudio[0]?.data ?? []), [2]);
});

function createClock(values: number[]): () => number {
  let index = 0;

  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

async function* createSpeechEvents(texts: string[]) {
  for (const [index, text] of texts.entries()) {
    yield {
      type: "agent.speech",
      roomId: "room-1",
      agentId: "agent-jean",
      text,
      ts: new Date(Date.UTC(2026, 5, 19, 12, 0, index)).toISOString()
    } satisfies RealtimeRoomEvent;
  }
}

function createSpeechAudio(values: number[]): SpeechAudio {
  return {
    channels: 1,
    data: new Int16Array(values),
    sampleRate: 16000
  };
}
