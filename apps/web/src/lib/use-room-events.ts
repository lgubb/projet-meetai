"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { realtimeRoomEventSchema, type RealtimeRoomEvent } from "@jean/shared";

import { workroomApi, type DevUser } from "./workroom-api";

type RoomEventsConnectionState = "idle" | "connecting" | "open" | "closed" | "error";
type ReplayEventsResponse = {
  events: RealtimeRoomEvent[];
};
const reconnectDelaysMs = [500, 1000, 2000, 5000];

export function useRoomEvents(roomId: string, user: DevUser | null) {
  const [events, setEvents] = useState<RealtimeRoomEvent[]>([]);
  const [connectionState, setConnectionState] = useState<RoomEventsConnectionState>("idle");
  const [error, setError] = useState("");
  const lastEventIdRef = useRef<string | null>(null);
  const userKey = useMemo(() => (user ? `${user.email}:${user.name}` : ""), [user]);

  useEffect(() => {
    if (!user?.email) {
      setConnectionState("idle");
      return;
    }

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let socket: WebSocket | null = null;
    let isDisposed = false;
    setEvents([]);
    setError("");
    lastEventIdRef.current = null;

    const addEvents = (nextEvents: RealtimeRoomEvent[]) => {
      for (const event of nextEvents) {
        if (event.eventId) {
          lastEventIdRef.current = event.eventId;
        }
      }

      setEvents((current) => mergeRoomEvents(current, nextEvents));
    };

    const replayMissingEvents = async () => {
      const afterEventId = lastEventIdRef.current;

      try {
        const replayQuery = afterEventId ? `?afterEventId=${encodeURIComponent(afterEventId)}` : "";
        const url = `/rooms/${encodeURIComponent(roomId)}/events/replay${replayQuery}`;
        const replay = await workroomApi<ReplayEventsResponse>(url, {
          user
        });

        addEvents(replay.events);
      } catch {
        setError("Could not replay missed room events.");
      }
    };

    const scheduleReconnect = () => {
      const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)];

      reconnectAttempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (isDisposed) {
        return;
      }

      socket = new WebSocket(buildRoomEventsUrl(roomId, user));
      setConnectionState("connecting");

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        setConnectionState("open");
        setError("");
        void replayMissingEvents();
      });

      socket.addEventListener("message", (message) => {
        try {
          const event = realtimeRoomEventSchema.parse(JSON.parse(String(message.data)));

          addEvents([event]);
        } catch {
          setError("Invalid room event.");
          setConnectionState("error");
        }
      });

      socket.addEventListener("close", () => {
        if (isDisposed) {
          return;
        }

        setConnectionState("closed");
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        setError("Room event socket failed. Reconnecting.");
        setConnectionState("error");
      });
    };

    connect();

    return () => {
      isDisposed = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
    };
  }, [roomId, user, userKey]);

  return {
    clearEvents: () => setEvents([]),
    connectionState,
    error,
    events
  };
}

function mergeRoomEvents(currentEvents: RealtimeRoomEvent[], nextEvents: RealtimeRoomEvent[]): RealtimeRoomEvent[] {
  const existingKeys = new Set(currentEvents.map(getRoomEventKey));
  const additions = nextEvents.filter((event) => !existingKeys.has(getRoomEventKey(event)));

  return [...additions.reverse(), ...currentEvents].slice(0, 200);
}

function getRoomEventKey(event: RealtimeRoomEvent): string {
  if (event.eventId) {
    return event.eventId;
  }

  return `${event.type}:${event.roomId}:${event.ts}:${JSON.stringify(event)}`;
}

function buildRoomEventsUrl(roomId: string, user: DevUser): string {
  const url = new URL(`/rooms/${encodeURIComponent(roomId)}/events`, getRoomEventsBaseUrl());

  url.searchParams.set("devUserEmail", user.email);

  if (user.name) {
    url.searchParams.set("devUserName", user.name);
  }

  return url.toString();
}

function getRoomEventsBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_WORKROOM_WS_URL) {
    return process.env.NEXT_PUBLIC_WORKROOM_WS_URL;
  }

  if (typeof window === "undefined") {
    return "ws://127.0.0.1:3001";
  }

  const currentUrl = new URL(window.location.href);

  if (currentUrl.hostname === "localhost" || currentUrl.hostname === "127.0.0.1") {
    return `ws://${currentUrl.hostname}:3001`;
  }

  const protocol = currentUrl.protocol === "https:" ? "wss:" : "ws:";

  return `${protocol}//${currentUrl.host}`;
}
