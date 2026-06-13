"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ConnectionState,
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useParticipants,
  type ControlBarControls,
  type TrackReferenceOrPlaceholder
} from "@livekit/components-react";
import { type Participant, Track } from "livekit-client";
import type { RealtimeArtifact, RealtimeRoomEvent } from "@jean/shared";

import {
  type DevUser,
  type JoinRoomResponse,
  type LiveKitConnection,
  type LiveKitTokenResponse,
  type Room,
  type RoomParticipant,
  type RoomResponse,
  type RoomTaskItem,
  type RoomTasksResponse,
  workroomApi
} from "@/lib/workroom-api";
import { defaultDevUser, readSavedDevUser, saveDevUser } from "@/lib/dev-user";
import { useRoomEvents } from "@/lib/use-room-events";

type RoomShellProps = {
  roomId: string;
};

const liveKitControls: ControlBarControls = {
  camera: true,
  chat: false,
  leave: true,
  microphone: true,
  screenShare: false,
  settings: false
};

export function RoomShell({ roomId }: RoomShellProps) {
  const [user, setUser] = useState<DevUser>(defaultDevUser);
  const [draftUser, setDraftUser] = useState<DevUser>(defaultDevUser);
  const [hasLoadedUser, setHasLoadedUser] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [taskItems, setTaskItems] = useState<RoomTaskItem[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [liveKitConnection, setLiveKitConnection] = useState<LiveKitConnection | null>(null);
  const [notice, setNotice] = useState("");
  const [isJoining, setIsJoining] = useState(true);
  const speakerLabelsById = useMemo(() => createSpeakerLabels(participants), [participants]);
  const {
    clearEvents,
    connectionState: roomEventsConnectionState,
    error: roomEventsError,
    events: roomEvents
  } = useRoomEvents(roomId, hasLoadedUser ? user : null);
  const displayedTaskItems = useMemo(() => mergeRoomTaskEvents(taskItems, roomEvents), [taskItems, roomEvents]);
  const activeTaskItem = useMemo(
    () => displayedTaskItems.find((item) => item.task.id === activeTaskId) ?? displayedTaskItems[0] ?? null,
    [activeTaskId, displayedTaskItems]
  );
  const jeanSpeechEvents = useMemo(
    () => roomEvents.filter(isAgentSpeechEvent),
    [roomEvents]
  );

  useEffect(() => {
    const savedUser = readSavedDevUser();

    setUser(savedUser);
    setDraftUser(savedUser);
    setHasLoadedUser(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedUser) {
      return;
    }

    void joinAndLoadRoom(user);
  }, [hasLoadedUser, roomId, user]);

  useEffect(() => {
    if (displayedTaskItems.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !displayedTaskItems.some((item) => item.task.id === activeTaskId)) {
      setActiveTaskId(displayedTaskItems[0]?.task.id ?? null);
    }
  }, [activeTaskId, displayedTaskItems]);

  async function joinAndLoadRoom(activeUser: DevUser) {
    setIsJoining(true);
    setLiveKitConnection(null);
    setTaskItems([]);
    setNotice("");

    try {
      await workroomApi<JoinRoomResponse>(`/rooms/${roomId}/join`, {
        method: "POST",
        user: activeUser
      });

      const data = await workroomApi<RoomResponse>(`/rooms/${roomId}`, {
        user: activeUser
      });

      setRoom(data.room);
      setParticipants(data.participants);

      const taskData = await workroomApi<RoomTasksResponse>(`/rooms/${roomId}/tasks`, {
        user: activeUser
      });

      setTaskItems(taskData.items);

      const liveKitData = await workroomApi<LiveKitTokenResponse>(`/rooms/${roomId}/livekit-token`, {
        method: "POST",
        body: {},
        user: activeUser
      });

      setLiveKitConnection(liveKitData.livekit);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setRoom(null);
      setParticipants([]);
      setTaskItems([]);
      setLiveKitConnection(null);
    } finally {
      setIsJoining(false);
    }
  }

  function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextUser = {
      email: draftUser.email.trim(),
      name: draftUser.name.trim()
    };

    if (!nextUser.email) {
      setNotice("Email is required.");
      return;
    }

    saveDevUser(nextUser);
    setUser(nextUser);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setNotice("Room link copied.");
  }

  return (
    <main className="room-page">
      <header className="room-topbar">
        <a className="brand-link" href="/">
          Jean Workroom
        </a>
        <div className="room-title-block">
          <p>{room?.status ?? (isJoining ? "Joining" : "Unavailable")}</p>
          <h1>{room?.title ?? "Room"}</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={copyShareLink} disabled={!room}>
            Share
          </button>
          <a href="/">Leave</a>
        </div>
      </header>

      {notice ? <div className="notice room-notice">{notice}</div> : null}

      <section className="room-layout">
        <aside className="room-sidebar participants-sidebar">
          <div className="panel-heading">
            <h2>Participants</h2>
            <span>{participants.length}</span>
          </div>

          <form className="compact-identity-form" onSubmit={saveUser}>
            <label>
              <span>Email</span>
              <input
                value={draftUser.email}
                onChange={(event) => setDraftUser((current) => ({ ...current, email: event.target.value }))}
                type="email"
                autoComplete="email"
              />
            </label>
            <label>
              <span>Name</span>
              <input
                value={draftUser.name}
                onChange={(event) => setDraftUser((current) => ({ ...current, name: event.target.value }))}
                autoComplete="name"
              />
            </label>
            <button type="submit">Switch</button>
          </form>

          <div className="participant-list">
            <LiveKitMediaPanel
              connection={liveKitConnection}
              isLoading={isJoining}
              onDisconnect={() => setNotice("LiveKit disconnected.")}
              onError={(error) => setNotice(error.message)}
            />

            {participants.map((participant) => (
              <div className="participant-tile" key={participant.id}>
                <div className="avatar">{participant.role.slice(0, 1)}</div>
                <div>
                  <strong>{formatParticipantName(participant)}</strong>
                  <span>{participant.role}</span>
                </div>
              </div>
            ))}
            {participants.length === 0 ? <p className="empty-state">No participants.</p> : null}
          </div>
        </aside>

        <section className="workspace-surface">
          <nav className="tabs-bar" aria-label="Workspace tabs">
            {displayedTaskItems.length === 0 ? (
              <button className="is-active" type="button">
                Workspace
              </button>
            ) : null}
            {displayedTaskItems.map((item) => (
              <button
                className={item.task.id === activeTaskItem?.task.id ? "is-active" : undefined}
                key={item.task.id}
                type="button"
                onClick={() => setActiveTaskId(item.task.id)}
                title={item.task.title}
              >
                {item.task.title}
              </button>
            ))}
          </nav>
          <div className="artifact-stage">
            {activeTaskItem ? (
              <ArtifactPreview taskItem={activeTaskItem} />
            ) : (
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>Waiting for artifacts</h2>
              </div>
            )}
          </div>
        </section>

        <aside className="room-sidebar jean-sidebar">
          <section>
            <div className="panel-heading">
              <h2>Jean</h2>
              <span>{jeanSpeechEvents.length > 0 ? "Active" : "Idle"}</span>
            </div>
            <div className="jean-status">
              <div className="jean-dot" />
              <p>Ready</p>
            </div>
            <div className="jean-speech-list">
              {jeanSpeechEvents.length === 0 ? <p className="empty-state">No speech.</p> : null}
              {jeanSpeechEvents.map((event, index) => (
                <p className="jean-speech-row" key={`${event.agentId}:${event.ts}:${index}`}>
                  {event.text}
                </p>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h2>Tasks</h2>
              <span>{displayedTaskItems.length}</span>
            </div>
            <div className="task-list">
              {displayedTaskItems.length === 0 ? <p className="empty-state">No tasks.</p> : null}
              {displayedTaskItems.map((item) => (
                <button
                  className={item.task.id === activeTaskItem?.task.id ? "task-row is-selected" : "task-row"}
                  key={item.task.id}
                  type="button"
                  onClick={() => setActiveTaskId(item.task.id)}
                >
                  <strong>{item.task.title}</strong>
                  <span>{formatTaskMeta(item)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="event-debug-panel">
            <div className="panel-heading">
              <h2>Events</h2>
              <span>{roomEventsConnectionState}</span>
            </div>
            {roomEventsError ? <p className="event-debug-error">{roomEventsError}</p> : null}
            <div className="event-debug-list">
              {roomEvents.length === 0 ? <p className="empty-state">No events.</p> : null}
              {roomEvents.map((event, index) => (
                <article className="event-debug-row" key={`${event.type}:${getEventTime(event)}:${index}`}>
                  <div>
                    <strong title={getEventTitle(event, speakerLabelsById)}>{getEventTitle(event, speakerLabelsById)}</strong>
                    <span>{getEventBadge(event)}</span>
                  </div>
                  <p>{getEventBody(event)}</p>
                  <time dateTime={getEventTime(event)}>{formatEventTime(getEventTime(event))}</time>
                </article>
              ))}
            </div>
            {roomEvents.length > 0 ? (
              <button className="secondary-button" type="button" onClick={clearEvents}>
                Clear
              </button>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

type LiveKitMediaPanelProps = {
  connection: LiveKitConnection | null;
  isLoading: boolean;
  onDisconnect: () => void;
  onError: (error: Error) => void;
};

function LiveKitMediaPanel({ connection, isLoading, onDisconnect, onError }: LiveKitMediaPanelProps) {
  if (!connection) {
    return (
      <div className="livekit-placeholder">
        <strong>{isLoading ? "Connecting media" : "Media unavailable"}</strong>
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      className="livekit-room-shell"
      connect={true}
      data-lk-theme="default"
      onDisconnected={onDisconnect}
      onError={onError}
      serverUrl={connection.serverUrl}
      token={connection.token}
      video={false}
    >
      <div className="livekit-status-row">
        <span>LiveKit</span>
        <ConnectionState />
      </div>
      <LiveKitParticipantTiles />
      <ControlBar
        className="livekit-controls"
        controls={liveKitControls}
        saveUserChoices={false}
        variation="minimal"
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function LiveKitParticipantTiles() {
  const liveKitParticipants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false
  });

  if (liveKitParticipants.length === 0) {
    return <p className="empty-state">No LiveKit participants.</p>;
  }

  const trackedParticipantIds = new Set(cameraTracks.map((trackRef) => trackRef.participant.identity));
  const participantsWithoutTiles = liveKitParticipants.filter(
    (participant) => !trackedParticipantIds.has(participant.identity)
  );

  return (
    <div className="livekit-grid">
      {cameraTracks.map((trackRef) => (
        <ParticipantTile key={getTrackRefKey(trackRef)} trackRef={trackRef} />
      ))}
      {participantsWithoutTiles.map((participant) => (
        <LiveKitParticipantFallbackTile key={participant.identity} participant={participant} />
      ))}
    </div>
  );
}

function LiveKitParticipantFallbackTile({ participant }: { participant: Participant }) {
  const label = participant.name || participant.identity;

  return (
    <div className="livekit-participant-card">
      <div className="livekit-participant-avatar">{label.slice(0, 1).toUpperCase()}</div>
      <strong>{label}</strong>
      <span>{participant.isLocal ? "Local" : "Remote"}</span>
    </div>
  );
}

function ArtifactPreview({ taskItem }: { taskItem: RoomTaskItem }) {
  const artifact = taskItem.artifacts[0] ?? null;

  if (!artifact) {
    return (
      <div className="artifact-preview">
        <p className="eyebrow">{taskItem.task.status}</p>
        <h2>{taskItem.task.title}</h2>
        <p>Task created. Waiting for artifact.</p>
      </div>
    );
  }

  return (
    <div className="artifact-preview">
      <p className="eyebrow">{formatArtifactType(artifact.type)}</p>
      <h2>{artifact.title}</h2>
      <p>{formatArtifactContent(artifact)}</p>
    </div>
  );
}

function getTrackRefKey(trackRef: TrackReferenceOrPlaceholder): string {
  return `${trackRef.participant.identity}:${trackRef.source}`;
}

function mergeRoomTaskEvents(initialItems: RoomTaskItem[], events: RealtimeRoomEvent[]): RoomTaskItem[] {
  const itemsByTaskId = new Map<string, RoomTaskItem>();

  for (const item of initialItems) {
    itemsByTaskId.set(item.task.id, {
      task: item.task,
      artifacts: [...item.artifacts]
    });
  }

  for (const event of [...events].reverse()) {
    if (event.type === "task.created") {
      const existing = itemsByTaskId.get(event.task.id);

      itemsByTaskId.set(event.task.id, {
        task: event.task,
        artifacts: existing?.artifacts ?? []
      });
    }

    if (event.type === "artifact.created" && event.artifact.taskId) {
      const existing = itemsByTaskId.get(event.artifact.taskId);

      if (existing) {
        itemsByTaskId.set(event.artifact.taskId, {
          task: existing.task,
          artifacts: upsertArtifact(existing.artifacts, event.artifact)
        });
      }
    }
  }

  return [...itemsByTaskId.values()].sort(
    (left, right) => new Date(left.task.createdAt).getTime() - new Date(right.task.createdAt).getTime()
  );
}

function upsertArtifact(artifacts: RealtimeArtifact[], artifact: RealtimeArtifact): RealtimeArtifact[] {
  const nextArtifacts = artifacts.filter((candidate) => candidate.id !== artifact.id);

  return [...nextArtifacts, artifact].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function isAgentSpeechEvent(
  event: RealtimeRoomEvent
): event is Extract<RealtimeRoomEvent, { type: "agent.speech" }> {
  return event.type === "agent.speech";
}

function formatTaskMeta(item: RoomTaskItem): string {
  const artifact = item.artifacts[0];

  return artifact ? `${item.task.status} / ${formatArtifactType(artifact.type)}` : item.task.status;
}

function formatArtifactType(type: RealtimeArtifact["type"]): string {
  const labels: Record<RealtimeArtifact["type"], string> = {
    CODE: "Code",
    DIAGRAM: "Diagram",
    DOCUMENT: "Document",
    LOG: "Log",
    PREVIEW: "Preview",
    RESEARCH: "Research"
  };

  return labels[type];
}

function formatArtifactContent(artifact: RealtimeArtifact): string {
  const content = artifact.latestVersion?.content;

  if (typeof content?.text === "string") {
    return content.text;
  }

  if (typeof content?.value === "string") {
    return content.value;
  }

  return `${formatArtifactType(artifact.type)} draft created.`;
}

function createSpeakerLabels(participants: RoomParticipant[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const participant of participants) {
    const participantId = participant.userId ?? participant.agentId;

    if (participantId) {
      labels.set(participantId, formatParticipantName(participant));
    }
  }

  return labels;
}

function formatParticipantName(participant: RoomParticipant): string {
  return participant.userName ?? participant.agentName ?? participant.userEmail ?? participant.userId ?? participant.agentId ?? "Participant";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function getEventTitle(event: RealtimeRoomEvent, speakerLabelsById: Map<string, string>): string {
  if (event.type === "transcript.partial" || event.type === "transcript.final") {
    return speakerLabelsById.get(event.speakerId) ?? event.speakerId;
  }

  if (event.type === "agent.speech") {
    return "Jean";
  }

  if (event.type === "task.created") {
    return "Task";
  }

  return "Artifact";
}

function getEventBadge(event: RealtimeRoomEvent): string {
  if (event.type === "transcript.partial") {
    return "Partial";
  }

  if (event.type === "transcript.final") {
    return "Final";
  }

  if (event.type === "task.created") {
    return "Created";
  }

  if (event.type === "artifact.created") {
    return formatArtifactType(event.artifact.type);
  }

  return "Speech";
}

function getEventBody(event: RealtimeRoomEvent): string {
  if (event.type === "transcript.partial" || event.type === "transcript.final" || event.type === "agent.speech") {
    return event.text;
  }

  if (event.type === "task.created") {
    return event.task.title;
  }

  return event.artifact.title;
}

function getEventTime(event: RealtimeRoomEvent): string {
  return event.ts;
}
