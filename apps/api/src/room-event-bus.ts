import { realtimeRoomEventSchema, type RealtimeRoomEvent } from "@jean/shared";
import type { WebSocket } from "ws";

const webSocketOpenState = 1;

export class RoomEventBus {
  private readonly clientsByRoomId = new Map<string, Set<WebSocket>>();

  join(roomId: string, socket: WebSocket): void {
    let clients = this.clientsByRoomId.get(roomId);

    if (!clients) {
      clients = new Set();
      this.clientsByRoomId.set(roomId, clients);
    }

    clients.add(socket);

    const leave = () => {
      this.leave(roomId, socket);
    };

    socket.once("close", leave);
    socket.once("error", leave);
  }

  publish(event: RealtimeRoomEvent): RealtimeRoomEvent {
    const validatedEvent = realtimeRoomEventSchema.parse(event);
    const clients = this.clientsByRoomId.get(validatedEvent.roomId);

    if (!clients) {
      return validatedEvent;
    }

    const message = JSON.stringify(validatedEvent);

    for (const client of clients) {
      if (client.readyState !== webSocketOpenState) {
        clients.delete(client);
        continue;
      }

      client.send(message);
    }

    if (clients.size === 0) {
      this.clientsByRoomId.delete(validatedEvent.roomId);
    }

    return validatedEvent;
  }

  close(): void {
    for (const clients of this.clientsByRoomId.values()) {
      for (const client of clients) {
        client.close();
      }
    }

    this.clientsByRoomId.clear();
  }

  private leave(roomId: string, socket: WebSocket): void {
    const clients = this.clientsByRoomId.get(roomId);

    if (!clients) {
      return;
    }

    clients.delete(socket);

    if (clients.size === 0) {
      this.clientsByRoomId.delete(roomId);
    }
  }
}
