import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  type Room
} from "@livekit/rtc-node";

import type { SpeechAudio } from "./deepgram-tts.js";
import type { VoiceOutput } from "./jean-voice.js";

export type LiveKitVoiceOutputOptions = {
  channels?: number;
  frameDurationMs?: number;
  sampleRate: number;
  trackName: string;
};

export async function createLiveKitVoiceOutput(
  room: Room,
  options: LiveKitVoiceOutputOptions
): Promise<VoiceOutput & { close(): Promise<void> }> {
  if (!room.localParticipant) {
    throw new Error("LiveKit room has no local participant for Jean voice.");
  }

  const channels = options.channels ?? 1;
  const source = new AudioSource(options.sampleRate, channels);
  const track = LocalAudioTrack.createAudioTrack(options.trackName, source);

  await room.localParticipant.publishTrack(
    track,
    new TrackPublishOptions({
      source: TrackSource.SOURCE_MICROPHONE
    })
  );

  return {
    async speak(audio, signal) {
      assertAudioFormat(audio, options.sampleRate, channels);

      for (const frame of splitAudioIntoFrames(audio, options.frameDurationMs ?? 20)) {
        if (signal?.aborted) {
          return;
        }

        await source.captureFrame(frame);
      }

      await source.waitForPlayout();
    },
    async close() {
      await track.close(true);
    }
  };
}

function assertAudioFormat(audio: SpeechAudio, sampleRate: number, channels: number): void {
  if (audio.sampleRate !== sampleRate || audio.channels !== channels) {
    throw new Error("Jean voice audio format does not match the LiveKit voice track.");
  }
}

function splitAudioIntoFrames(audio: SpeechAudio, frameDurationMs: number): AudioFrame[] {
  const samplesPerChannel = Math.max(1, Math.floor((audio.sampleRate * frameDurationMs) / 1000));
  const samplesPerFrame = samplesPerChannel * audio.channels;
  const frames: AudioFrame[] = [];

  for (let offset = 0; offset < audio.data.length; offset += samplesPerFrame) {
    const data = audio.data.slice(offset, Math.min(offset + samplesPerFrame, audio.data.length));

    frames.push(new AudioFrame(data, audio.sampleRate, audio.channels, Math.floor(data.length / audio.channels)));
  }

  return frames;
}
