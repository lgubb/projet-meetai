import type { RealtimeRoomEvent } from "@jean/shared";

import type { RoomEventPublisher } from "./transcription-worker.js";

export type WorkroomApiPublisherOptions = {
  apiUrl: string;
  workerToken?: string | null;
  fetchFn?: typeof fetch;
};

export function createWorkroomApiPublisher(options: WorkroomApiPublisherOptions): RoomEventPublisher {
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async publish(event: RealtimeRoomEvent) {
      const response = await fetchFn(createEventUrl(options.apiUrl, event.roomId), {
        method: "POST",
        headers: createHeaders(options.workerToken),
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        throw new Error(`Workroom API rejected room event with ${response.status}.`);
      }
    }
  };
}

function createEventUrl(apiUrl: string, roomId: string): string {
  return new URL(`/internal/rooms/${encodeURIComponent(roomId)}/events`, apiUrl).toString();
}

function createHeaders(workerToken: string | null | undefined): Headers {
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json"
  });

  if (workerToken) {
    headers.set("authorization", `Bearer ${workerToken}`);
  }

  return headers;
}
