import {
  AudioStream,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  type RemoteTrack
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";

import { AsyncQueue } from "./async-queue.js";
import type { AudioChunk, HumanAudioTrack } from "./transcription-worker.js";

export type LiveKitAudioSourceOptions = {
  roomId: string;
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
  identity?: string;
  name?: string;
  sampleRate?: number;
  channels?: number;
};

export type LiveKitAudioSource = AsyncIterable<HumanAudioTrack> & {
  disconnect(): Promise<void>;
};

export async function createLiveKitAudioSource(options: LiveKitAudioSourceOptions): Promise<LiveKitAudioSource> {
  const room = new Room();
  const queue = new AsyncQueue<HumanAudioTrack>();
  const identity = options.identity ?? "jean-transcriber";
  const sampleRate = options.sampleRate ?? 16000;
  const channels = options.channels ?? 1;

  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (!(track instanceof RemoteAudioTrack) || participant.identity === identity) {
      return;
    }

    queue.push({
      speakerId: participant.identity,
      audio: readAudioTrack(track, sampleRate, channels)
    });
  });
  room.on(RoomEvent.Disconnected, () => queue.close());

  await room.connect(options.serverUrl, await issueSystemToken(options, identity), {
    autoSubscribe: true,
    dynacast: false
  });

  // TODO: production scaling should supervise one LiveKit source per active room and shard by roomId.
  return {
    disconnect: () => room.disconnect(),
    [Symbol.asyncIterator]: () => queue[Symbol.asyncIterator]()
  };
}

async function issueSystemToken(options: LiveKitAudioSourceOptions, identity: string): Promise<string> {
  const token = new AccessToken(options.apiKey, options.apiSecret, {
    identity,
    name: options.name ?? "Jean Transcriber",
    ttl: "6h"
  });

  token.addGrant({
    room: options.roomId,
    roomJoin: true,
    canPublish: false,
    canPublishData: false,
    canSubscribe: true
  });

  return token.toJwt();
}

async function* readAudioTrack(
  track: RemoteTrack,
  sampleRate: number,
  channels: number
): AsyncIterable<AudioChunk> {
  const stream = new AudioStream(track, {
    sampleRate,
    numChannels: channels
  });

  for await (const frame of stream) {
    yield {
      data: frame.data,
      sampleRate: frame.sampleRate,
      channels: frame.channels
    };
  }
}
