"use client";

import { useEffect, useMemo, useState } from "react";
import { realtimeRoomEventSchema, type RealtimeRoomEvent } from "@jean/shared";

import type { DevUser } from "./workroom-api";

type RoomEventsConnectionState = "idle" | "connecting" | "open" | "closed" | "error";

export function useRoomEvents(roomId: string, user: DevUser | null) {
  const [events, setEvents] = useState<RealtimeRoomEvent[]>([]);
  const [connectionState, setConnectionState] = useState<RoomEventsConnectionState>("idle");
  const [error, setError] = useState("");
  const userKey = useMemo(() => (user ? `${user.email}:${user.name}` : ""), [user]);

  useEffect(() => {
    if (!user?.email) {
      setConnectionState("idle");
      return;
    }

    const socket = new WebSocket(buildRoomEventsUrl(roomId, user));

    setConnectionState("connecting");
    setError("");

    socket.addEventListener("open", () => {
      setConnectionState("open");
    });

    socket.addEventListener("message", (message) => {
      try {
        const event = realtimeRoomEventSchema.parse(JSON.parse(String(message.data)));

        setEvents((current) => [event, ...current].slice(0, 50));
      } catch {
        setError("Invalid room event.");
        setConnectionState("error");
      }
    });

    socket.addEventListener("close", () => {
      setConnectionState((current) => (current === "error" ? current : "closed"));
    });

    socket.addEventListener("error", () => {
      setError("Room event socket failed.");
      setConnectionState("error");
    });

    return () => {
      socket.close();
    };
  }, [roomId, user, userKey]);

  return {
    clearEvents: () => setEvents([]),
    connectionState,
    error,
    events
  };
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
