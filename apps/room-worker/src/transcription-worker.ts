import { realtimeRoomEventSchema, type RealtimeRoomEvent } from "@jean/shared";

export type AudioChunk = {
  data: Int16Array;
  sampleRate: number;
  channels: number;
};

export type HumanAudioTrack = {
  speakerId: string;
  audio: AsyncIterable<AudioChunk>;
};

export type TranscriptResult = {
  speakerId: string;
  text: string;
  isFinal: boolean;
  ts?: Date;
  startedAt?: Date;
  endedAt?: Date;
};

export type STTProvider = {
  transcribeTrack(input: {
    speakerId: string;
    audio: AsyncIterable<AudioChunk>;
    signal?: AbortSignal;
  }): AsyncIterable<TranscriptResult>;
};

export type RoomEventPublisher = {
  publish(event: RealtimeRoomEvent): Promise<void>;
};

export type RunTranscriptionWorkerOptions = {
  roomId: string;
  audioTracks: AsyncIterable<HumanAudioTrack>;
  sttProvider: STTProvider;
  publisher: RoomEventPublisher;
  signal?: AbortSignal;
};

export async function runTranscriptionWorker(options: RunTranscriptionWorkerOptions): Promise<void> {
  const trackTasks = new Set<Promise<void>>();

  for await (const track of options.audioTracks) {
    if (options.signal?.aborted) {
      break;
    }

    const task = transcribeTrack({
      roomId: options.roomId,
      track,
      sttProvider: options.sttProvider,
      publisher: options.publisher,
      signal: options.signal
    }).finally(() => {
      trackTasks.delete(task);
    });

    trackTasks.add(task);
  }

  await Promise.all(trackTasks);
}

async function transcribeTrack(options: {
  roomId: string;
  track: HumanAudioTrack;
  sttProvider: STTProvider;
  publisher: RoomEventPublisher;
  signal?: AbortSignal;
}): Promise<void> {
  const results = options.sttProvider.transcribeTrack({
    speakerId: options.track.speakerId,
    audio: options.track.audio,
    signal: options.signal
  });

  for await (const result of results) {
    if (options.signal?.aborted) {
      return;
    }

    const text = result.text.trim();

    if (!text) {
      continue;
    }

    await options.publisher.publish(createTranscriptEvent(options.roomId, result, text));
  }
}

function createTranscriptEvent(roomId: string, result: TranscriptResult, text: string): RealtimeRoomEvent {
  const baseEvent = {
    roomId,
    speakerId: result.speakerId,
    text,
    ts: (result.ts ?? new Date()).toISOString(),
    startedAt: result.startedAt?.toISOString(),
    endedAt: result.endedAt?.toISOString()
  };

  return realtimeRoomEventSchema.parse({
    ...baseEvent,
    type: result.isFinal ? "transcript.final" : "transcript.partial"
  });
}
