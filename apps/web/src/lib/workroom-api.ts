import type { RealtimeArtifact, RealtimeTask } from "@jean/shared";

export type DevUser = {
  email: string;
  name: string;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Room = {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
};

export type RoomParticipant = {
  id: string;
  roomId: string;
  userId: string | null;
  agentId: string | null;
  userEmail: string | null;
  userName: string | null;
  agentName: string | null;
  role: string;
  joinedAt: string;
  leftAt: string | null;
};

export type OrganizationsResponse = {
  organizations: Organization[];
};

export type RoomsResponse = {
  rooms: Room[];
};

export type RoomResponse = {
  room: Room;
  participants: RoomParticipant[];
};

export type CreateOrganizationResponse = {
  organization: Organization;
};

export type CreateRoomResponse = {
  room: Room;
};

export type JoinRoomResponse = {
  room: Room;
  participant: RoomParticipant;
};

export type LiveKitConnection = {
  serverUrl: string;
  token: string;
  roomName: string;
  identity: string;
};

export type LiveKitTokenResponse = {
  livekit: LiveKitConnection;
};

export type RoomTaskItem = {
  task: RealtimeTask;
  artifacts: RealtimeArtifact[];
};

export type RoomTasksResponse = {
  items: RoomTaskItem[];
};

export class WorkroomApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WorkroomApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  user: DevUser;
};

export async function workroomApi<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers({
    accept: "application/json",
    "x-dev-user-email": options.user.email
  });

  if (options.user.name) {
    headers.set("x-dev-user-name", options.user.name);
  }

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`/api/workroom${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new WorkroomApiError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };

    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    return response.statusText;
  }

  return response.statusText;
}
