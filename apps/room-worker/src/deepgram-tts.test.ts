import assert from "node:assert/strict";
import test from "node:test";

import { createDeepgramTTSProvider } from "./deepgram-tts.js";

test("createDeepgramTTSProvider requests linear16 PCM from Deepgram", async () => {
  const requests: Array<{ body: string; headers: Headers; url: string }> = [];
  const provider = createDeepgramTTSProvider(
    {
      apiKey: "deepgram-key",
      model: "aura-2-thalia-en",
      sampleRate: 16000
    },
    {
      baseUrl: "https://deepgram.example",
      fetchFn: async (url, init) => {
        requests.push({
          body: String(init?.body),
          headers: new Headers(init?.headers),
          url: String(url)
        });

        return new Response(int16ArrayBuffer([1, -2, 3]), {
          headers: {
            "content-type": "audio/raw"
          },
          status: 200
        });
      }
    }
  );

  const audio = await provider.synthesize({
    text: "Oui, je m'en occupe."
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "https://deepgram.example/v1/speak?model=aura-2-thalia-en&encoding=linear16&container=none&sample_rate=16000"
  );
  assert.equal(requests[0]?.headers.get("authorization"), "Token deepgram-key");
  assert.equal(requests[0]?.headers.get("content-type"), "application/json");
  assert.equal(requests[0]?.body, JSON.stringify({ text: "Oui, je m'en occupe." }));
  assert.equal(audio.sampleRate, 16000);
  assert.equal(audio.channels, 1);
  assert.deepEqual([...audio.data], [1, -2, 3]);
});

function int16ArrayBuffer(values: number[]): ArrayBuffer {
  const data = new Int16Array(values);

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
